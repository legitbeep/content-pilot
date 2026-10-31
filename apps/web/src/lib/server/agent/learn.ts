// Docs: docs/brand-memory.md
// Learning from edits (plan 7). Reads edit_events (incl. plan 9's op='caption_edit'), clip_feedback
// (plan 5) and the user's rules; task learn_rules finds repeated patterns; `applyPatterns` turns
// them into `candidate` brand_rules (source edits). NEVER activates a rule: the user does that on
// /brand. Also used by the agent's propose_memory_update.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { READY_AT, SCOPES, type Scope } from '$lib/entities/brand';
import { generateJSON } from '../llm';

export const LEARN_EVERY = 25; // new events between automatic runs

export type Evidence = Record<string, unknown> & { kind: string; clip_id?: string };
export type RuleRow = {
	id: string;
	rule: string;
	scope: Scope;
	source: string;
	status: string;
	evidence: Evidence[];
	evidence_count: number;
	conflicts_with: string | null;
};
export type Pattern = {
	rule: string;
	scope: Scope;
	evidence: Evidence[];
	same_as: string | null;
	contradicts: string | null;
};
export type Changes = {
	inserts: Omit<RuleRow, 'id'>[];
	updates: Pick<RuleRow, 'id' | 'evidence' | 'evidence_count' | 'conflicts_with'>[];
	ready: string[];
	conflicts: { rule: string; stated: string }[];
};

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
const keyOf = (e: Evidence) =>
	e.clip_id ? `clip:${e.clip_id}` : String(e.event_id ?? e.post_id ?? JSON.stringify(e));
const same = (a: Evidence, b: Evidence) => JSON.stringify(a) === JSON.stringify(b);
/** Evidence counts once per clip (or per post / item without a clip). */
const newKeys = (old: Evidence[], add: Evidence[]) => {
	const seen = new Set(old.map(keyOf));
	return new Set(add.map(keyOf).filter((k) => !seen.has(k))).size;
};

/** Pure: patterns → candidate inserts/updates. Matches by id (same_as) or identical text.
 * Active/pinned matches are already rules; archived ones were dismissed (never re-proposed). */
export function applyPatterns(rules: RuleRow[], patterns: Pattern[]): Changes {
	const out: Changes = { inserts: [], updates: [], ready: [], conflicts: [] };
	const all = rules.map((r) => ({ ...r }));
	const byId = new Map(all.map((r) => [r.id, r]));
	const live = (id: string | null) => {
		const r = id ? byId.get(id) : undefined;
		return r && (r.status === 'active' || r.status === 'pinned') ? r : undefined;
	};
	for (const p of patterns) {
		if (!p.evidence.length) continue;
		const target =
			(p.same_as ? byId.get(p.same_as) : undefined) ??
			all.find((r) => norm(r.rule) === norm(p.rule)) ??
			out.inserts.find((r) => norm(r.rule) === norm(p.rule));
		const conflict = live(p.contradicts);
		if (target && target.status !== 'candidate') continue;
		if (target) {
			const added = newKeys(target.evidence, p.evidence);
			if (!added) continue;
			const before = target.evidence_count;
			target.evidence = [
				...target.evidence,
				...p.evidence.filter((e) => !target.evidence.some((o) => same(o, e)))
			].slice(-50);
			target.evidence_count = before + added;
			if (!target.conflicts_with && conflict) {
				target.conflicts_with = conflict.id;
				out.conflicts.push({ rule: target.rule, stated: conflict.rule });
			}
			if ('id' in target && typeof target.id === 'string') {
				const id = target.id;
				const i = out.updates.findIndex((u) => u.id === id);
				const u = {
					id,
					evidence: target.evidence,
					evidence_count: target.evidence_count,
					conflicts_with: target.conflicts_with
				};
				if (i >= 0) out.updates[i] = u;
				else out.updates.push(u);
			}
			if (before < READY_AT && target.evidence_count >= READY_AT) out.ready.push(target.rule);
			continue;
		}
		const row = {
			rule: p.rule,
			scope: p.scope,
			source: 'edits',
			status: 'candidate',
			evidence: p.evidence.slice(-50),
			evidence_count: newKeys([], p.evidence),
			conflicts_with: conflict?.id ?? null
		};
		out.inserts.push(row);
		if (row.evidence_count >= READY_AT) out.ready.push(row.rule);
		if (conflict) out.conflicts.push({ rule: row.rule, stated: conflict.rule });
	}
	return out;
}

type Ev = {
	id: string;
	clip_id: string;
	op: string;
	args: Record<string, unknown>;
	summary: string;
	source: string;
	created_at: string;
};
type ClipBounds = { start_s: number; end_s: number; file_start_s: number | null };

function levenshtein(a: string, b: string) {
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++)
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		prev = cur;
	}
	return prev[b.length];
}

/** Drops undone edits, then trivial ones: undo/redo, splits, trims within 1s of the clip's original
 * bounds, caption typo fixes. */
export function meaningful(events: Ev[], clips: Record<string, ClipBounds>): Ev[] {
	const kept: Ev[] = [];
	for (const e of events) {
		if (e.op === 'undo') {
			const i = kept.findLastIndex((k) => k.clip_id === e.clip_id);
			if (i >= 0) kept.splice(i, 1);
		} else if (e.op !== 'redo') kept.push(e);
	}
	return kept.filter((e) => {
		if (e.op === 'split') return false;
		if (e.op === 'trim') {
			const c = clips[e.clip_id];
			if (!c) return true;
			// ponytail: compares with the clip's original range, not the previous trim.
			const off = c.file_start_s ?? c.start_s;
			const near = (v: unknown, base: number) => typeof v !== 'number' || Math.abs(v - base) < 1;
			return !(near(e.args.start, c.start_s - off) && near(e.args.end, c.end_s - off));
		}
		if (e.op === 'caption_edit') {
			const a = String(e.args.before ?? '');
			const b = String(e.args.after ?? '');
			return levenshtein(a, b) > Math.max(2, Math.min(a.length, b.length) * 0.1);
		}
		return true;
	});
}

const Patterns = z.object({
	patterns: z
		.array(
			z.object({
				rule: z.string().trim().min(3).max(300),
				scope: z.enum(SCOPES),
				evidence: z.array(z.string()).default([]),
				same_as: z.string().nullable().default(null),
				contradicts: z.string().nullable().default(null)
			})
		)
		.max(10)
});

const LEARN_SYSTEM = `You find repeated habits in how a creator edits their short clips, so they can become brand rules.
Input: recent edit events (e1, e2, …; each on a clip), clip approvals/rejections (f1, …) and the creator's existing rules (r1, …, with status).
- Only report a pattern that shows up on at least 2 different clips, or that a rejection reason states clearly. Ignore one-offs.
- Write each as one short imperative rule that an AI editor could follow (e.g. "Cut the first 2 seconds of every clip.", "Keep captions yellow."), with a scope: editing, captions, copy, clip_selection or all.
- evidence: the ids (e…, f…) that show it.
- same_as: the id of an existing rule that says the same thing, else null.
- contradicts: the id of an active or pinned rule this habit goes against, else null.
Return JSON: {"patterns": [{"rule": "...", "scope": "...", "evidence": ["e1"], "same_as": null, "contradicts": null}]}. Empty list if nothing repeats.`;

export type LearnResult = { skipped: boolean; ready: string[]; conflicts: Changes['conflicts'] };
const SKIPPED: LearnResult = { skipped: true, ready: [], conflicts: [] };

async function loadRules(supabase: SupabaseClient) {
	const { data, error } = await supabase
		.from('brand_rules')
		.select('id, rule, scope, source, status, evidence, evidence_count, conflicts_with');
	if (error) throw new Error(`brand_rules read failed: ${error.message}`);
	return (data ?? []) as RuleRow[];
}

export async function writeChanges(supabase: SupabaseClient, userId: string, c: Changes) {
	const now = new Date().toISOString();
	if (c.inserts.length) {
		const { error } = await supabase
			.from('brand_rules')
			.insert(c.inserts.map((r) => ({ ...r, user_id: userId, updated_at: now })));
		if (error) throw new Error(`brand_rules insert failed: ${error.message}`);
	}
	for (const u of c.updates) {
		const { id, ...fields } = u;
		const { error } = await supabase
			.from('brand_rules')
			.update({ ...fields, updated_at: now })
			.eq('id', id)
			.eq('status', 'candidate');
		if (error) throw new Error(`brand_rules update failed: ${error.message}`);
	}
}

/** Analyze events since the user's cursor. Without `force` it runs only at LEARN_EVERY new events.
 * Claims the run by moving the cursor (compare-and-set) and moves it back if the AI call fails. */
export async function learnFromEdits(
	supabase: SupabaseClient,
	userId: string,
	{ force = false, beforeAI = async () => {} }: { force?: boolean; beforeAI?: () => Promise<void> }
): Promise<LearnResult> {
	await supabase
		.from('learn_cursor')
		.upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
	const { data: cur } = await supabase
		.from('learn_cursor')
		.select('last_event_at')
		.eq('user_id', userId)
		.single();
	const last = String(cur?.last_event_at ?? '1970-01-01T00:00:00Z');
	const { count } = await supabase
		.from('edit_events')
		.select('id', { count: 'exact', head: true })
		.gt('created_at', last);
	if (!count || (!force && count < LEARN_EVERY)) return SKIPPED;
	await beforeAI();

	const { data: evData } = await supabase
		.from('edit_events')
		.select('id, clip_id, op, args, summary, source, created_at')
		.gt('created_at', last)
		.order('created_at')
		.limit(300);
	const events = (evData ?? []) as Ev[];
	if (!events.length) return SKIPPED;
	const newest = events[events.length - 1].created_at;
	const { data: claimed } = await supabase
		.from('learn_cursor')
		.update({ last_event_at: newest, ran_at: new Date().toISOString() })
		.eq('user_id', userId)
		.eq('last_event_at', last)
		.select('user_id');
	if (!claimed?.length) return SKIPPED; // another run got there first

	try {
		const clipIds = [...new Set(events.map((e) => e.clip_id))];
		const [{ data: clipRows }, feedback, rules] = await Promise.all([
			supabase.from('clips').select('id, start_s, end_s, file_start_s, reason').in('id', clipIds),
			// clip_feedback is plan 5's table; tolerate it missing.
			supabase
				.from('clip_feedback')
				.select('id, clip_id, decision, reason')
				.gt('created_at', last)
				.limit(100),
			loadRules(supabase)
		]);
		const clips = Object.fromEntries((clipRows ?? []).map((c) => [c.id, c as ClipBounds]));
		const kept = meaningful(events, clips);
		const fb = (feedback.error ? [] : (feedback.data ?? [])) as {
			id: string;
			clip_id: string;
			decision: string;
			reason: string | null;
		}[];
		if (!kept.length && !fb.some((f) => f.reason))
			return { skipped: false, ready: [], conflicts: [] };

		const clipNo = new Map(clipIds.map((id, i) => [id, i + 1]));
		const refs: Record<string, Evidence> = {};
		const lines: string[] = [];
		kept.forEach((e, i) => {
			const caption = e.op === 'caption_edit';
			refs[`e${i + 1}`] = caption
				? {
						kind: 'caption',
						event_id: e.id,
						clip_id: e.clip_id,
						before: e.args.before,
						after: e.args.after
					}
				: { kind: 'edit', event_id: e.id, clip_id: e.clip_id, op: e.op, summary: e.summary };
			lines.push(
				`e${i + 1} clip ${clipNo.get(e.clip_id)} (${e.source}): ${
					caption
						? `caption for ${e.args.platform} changed from "${e.args.before}" to "${e.args.after}"`
						: `${e.op} ${JSON.stringify(e.args)} — ${e.summary}`
				}`
			);
		});
		fb.forEach((f, i) => {
			refs[`f${i + 1}`] = {
				kind: 'feedback',
				feedback_id: f.id,
				clip_id: f.clip_id,
				decision: f.decision
			};
			lines.push(`f${i + 1}: ${f.decision} a clip${f.reason ? `, reason: "${f.reason}"` : ''}`);
		});
		const ruleRef = new Map(rules.map((r, i) => [`r${i + 1}`, r.id]));
		const ruleLines = rules.map(
			(r, i) => `r${i + 1} [${r.status}, ${r.scope}, ${r.source}]: ${r.rule}`
		);

		const { data } = await generateJSON({
			userId,
			task: 'learn_rules',
			schema: Patterns,
			system: LEARN_SYSTEM,
			prompt: `Events:\n${lines.join('\n')}\n\nExisting rules:\n${ruleLines.join('\n') || 'none'}`
		});
		const changes = applyPatterns(
			rules,
			data.patterns.map((p) => ({
				rule: p.rule,
				scope: p.scope,
				evidence: p.evidence.map((id) => refs[id]).filter(Boolean),
				same_as: (p.same_as && ruleRef.get(p.same_as)) || null,
				contradicts: (p.contradicts && ruleRef.get(p.contradicts)) || null
			}))
		);
		await writeChanges(supabase, userId, changes);
		return { skipped: false, ready: changes.ready, conflicts: changes.conflicts };
	} catch (e) {
		await supabase
			.from('learn_cursor')
			.update({ last_event_at: last })
			.eq('user_id', userId)
			.eq('last_event_at', newest);
		throw e;
	}
}

/** The agent's propose_memory_update: same pipeline, matched by identical text. */
export async function proposeRule(
	supabase: SupabaseClient,
	userId: string,
	p: { rule: string; scope: Scope; clipId: string; message: string }
) {
	const changes = applyPatterns(await loadRules(supabase), [
		{
			rule: p.rule,
			scope: p.scope,
			evidence: [{ kind: 'proposal', clip_id: p.clipId, text: p.message.slice(0, 500) }],
			same_as: null,
			contradicts: null
		}
	]);
	await writeChanges(supabase, userId, changes);
	return { ready: changes.ready };
}
