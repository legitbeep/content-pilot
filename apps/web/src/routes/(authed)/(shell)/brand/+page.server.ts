import { fail } from '@sveltejs/kit';
import { SCOPES, type BrandRule, type DraftRule, type Scope } from '$lib/entities/brand';
import {
	aiFail,
	generateStatedRules,
	loadBrand,
	parseDrafts,
	profileActions,
	ruleRow
} from '$lib/server/brand';
import { requireAIKeys } from '$lib/server/llm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, user } }) => {
	const [brand, rules] = await Promise.all([
		loadBrand(supabase, user!.id),
		supabase
			.from('brand_rules')
			.select(
				'id, rule, scope, source, status, evidence_count, evidence, created_at, updated_at, conflicts_with'
			)
			.order('created_at')
	]);
	if (rules.error) console.error('brand_rules load failed', rules.error);
	return {
		profile: brand.profile,
		logoUrl: brand.logoUrl,
		rules: (rules.data ?? []) as BrandRule[]
	};
};

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

/** op → the status it sets (edit is handled separately). */
const STATUS_OPS: Record<string, string> = {
	pin: 'pinned',
	unpin: 'active',
	archive: 'archived',
	restore: 'active'
};

export const actions: Actions = {
	...profileActions,
	/** Add a manual rule, or pin/unpin/archive/restore/edit one. RLS keeps it to the user's rows. */
	rule: async ({ request, locals: { supabase, user } }) => {
		const form = await request.formData();
		const op = String(form.get('op'));
		const id = String(form.get('id') ?? '');
		const text = String(form.get('text') ?? '').trim();
		const scope = String(form.get('scope') ?? 'all') as Scope;
		const now = new Date().toISOString();
		if ((op === 'add' || op === 'edit') && (text.length < 3 || text.length > 300))
			return fail(400, { message: 'Rules are 3 to 300 characters.' });
		if ((op === 'add' || op === 'edit') && !SCOPES.includes(scope))
			return fail(400, { message: 'Unknown scope.' });

		const q =
			op === 'add'
				? supabase
						.from('brand_rules')
						.insert(ruleRow(user!.id, { text, scope }, 'manual', 'active'))
				: op === 'edit'
					? supabase.from('brand_rules').update({ rule: text, scope, updated_at: now }).eq('id', id)
					: STATUS_OPS[op]
						? supabase
								.from('brand_rules')
								.update({ status: STATUS_OPS[op], updated_at: now })
								.eq('id', id)
						: null;
		if (!q) return fail(400, { message: 'Unknown action.' });
		const { error } = await q;
		if (error) return fail(500, { message: 'Could not update the rule. Try again.' });
		return { ruleSaved: op };
	},
	/** Regenerate from the profile → a diff (nothing is saved): rules to add, onboarding rules to
	 * archive. Pinned and manual rules are never proposed for removal. */
	regenerate: async ({ locals: { supabase, user } }) => {
		await requireAIKeys(user!.id, 'llm');
		const [{ profile }, existing] = await Promise.all([
			loadBrand(supabase, user!.id),
			supabase
				.from('brand_rules')
				.select('id, rule, scope, source, status')
				.neq('status', 'archived')
		]);
		let drafts: DraftRule[];
		try {
			drafts = await generateStatedRules(user!.id, profile);
		} catch (e) {
			return aiFail(e);
		}
		const rows = existing.data ?? [];
		const have = new Set(rows.map((r) => norm(r.rule)));
		const fresh = new Set(drafts.map((d) => norm(d.text)));
		return {
			diff: {
				adds: drafts.filter((d) => !have.has(norm(d.text))),
				removes: rows
					.filter((r) => r.source === 'onboarding' && r.status === 'active')
					.filter((r) => !fresh.has(norm(r.rule)))
					.map((r) => ({ id: r.id as string, text: r.rule as string, scope: r.scope as Scope }))
			}
		};
	},
	/** Apply only the accepted parts of a regenerate diff. Fields: adds (JSON), remove (ids). */
	applyRegenerate: async ({ request, locals: { supabase, user } }) => {
		const form = await request.formData();
		const adds = parseDrafts(form.get('adds'));
		const removes = form.getAll('remove').map(String);
		if (!adds) return fail(400, { message: 'Some rules are empty or too long.' });
		if (adds.length) {
			const ins = await supabase
				.from('brand_rules')
				.insert(adds.map((d) => ruleRow(user!.id, d, 'onboarding', 'active')));
			if (ins.error) return fail(500, { message: 'Could not save the new rules.' });
		}
		if (removes.length) {
			const upd = await supabase
				.from('brand_rules')
				.update({ status: 'archived', updated_at: new Date().toISOString() })
				.in('id', removes)
				.eq('source', 'onboarding')
				.eq('status', 'active');
			if (upd.error) return fail(500, { message: 'Could not archive the old rules.' });
		}
		return { applied: adds.length + removes.length };
	},
	/** Learned candidates (plan 7 edits, plan 9 performance). The user's explicit choice is the only
	 * thing that activates one. op=apply: activate (ids) → active, dismiss (ids) → archived.
	 * op=keep (id): keep the stated rule, archive the candidate. op=update (id): archive the stated
	 * rule the candidate conflicts with and activate the candidate. */
	learned: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const op = String(form.get('op'));
		const now = new Date().toISOString();
		const set = (ids: string[], status: string) =>
			ids.length
				? supabase
						.from('brand_rules')
						.update({ status, conflicts_with: null, updated_at: now })
						.in('id', ids)
						.eq('status', 'candidate')
				: Promise.resolve({ error: null });
		const failed = (r: { error: unknown }[]) =>
			r.some((x) => x.error)
				? fail(500, { message: 'Could not update the rules. Try again.' })
				: null;

		if (op === 'apply') {
			const r = await Promise.all([
				set(form.getAll('activate').map(String), 'active'),
				set(form.getAll('dismiss').map(String), 'archived')
			]);
			return failed(r) ?? { learnedSaved: true };
		}
		const id = String(form.get('id') ?? '');
		if (op === 'keep') return failed([await set([id], 'archived')]) ?? { learnedSaved: true };
		if (op === 'update') {
			const { data: cand } = await supabase
				.from('brand_rules')
				.select('conflicts_with')
				.eq('id', id)
				.eq('status', 'candidate')
				.maybeSingle();
			if (!cand) return fail(404, { message: 'That suggestion is gone. Reload the page.' });
			const r = [await set([id], 'active')];
			if (cand.conflicts_with)
				r.push(
					await supabase
						.from('brand_rules')
						.update({ status: 'archived', updated_at: now })
						.eq('id', cand.conflicts_with)
				);
			return failed(r) ?? { learnedSaved: true };
		}
		return fail(400, { message: 'Unknown action.' });
	}
};
