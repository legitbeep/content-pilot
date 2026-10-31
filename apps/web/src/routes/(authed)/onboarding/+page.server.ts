import { error, fail, redirect } from '@sveltejs/kit';
import { aiCapabilities, type ApiKey } from '$lib/entities/api-key';
import type { Scope } from '$lib/entities/brand';
import {
	aiFail,
	generateStatedRules,
	loadBrand,
	parseDrafts,
	profileActions,
	ruleRow
} from '$lib/server/brand';
import { keyActions } from '$lib/server/keys';
import { isDemoUser, requireAIKeys } from '$lib/server/llm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, user } }) => {
	const brand = await loadBrand(supabase, user!.id);
	if (brand.completed) redirect(303, '/');
	const [keys, yt, drafts] = await Promise.all([
		supabase.from('user_keys_public').select('*'),
		supabase
			.from('platform_connections_public')
			.select('account_name')
			.eq('platform', 'youtube')
			.maybeSingle(),
		// Review step drafts survive a refresh as onboarding candidates.
		supabase
			.from('brand_rules')
			.select('rule, scope')
			.eq('source', 'onboarding')
			.eq('status', 'candidate')
			.order('created_at')
	]);
	const k = (keys.data ?? []) as ApiKey[];
	return {
		...brand,
		keys: k,
		youtube: yt.data as { account_name: string | null } | null,
		// Onboarding is outside the shell, so it provides page.data.ai for <RequiresAI> itself.
		ai: aiCapabilities(k, isDemoUser(user)),
		drafts: (drafts.data ?? []).map((r) => ({ text: r.rule as string, scope: r.scope as Scope }))
	};
};

/** Replace the user's onboarding drafts (candidates) with `rows`. */
async function replaceDrafts(locals: App.Locals, rows: object[]) {
	const { supabase, user } = locals;
	const del = await supabase
		.from('brand_rules')
		.delete()
		.eq('user_id', user!.id)
		.eq('source', 'onboarding')
		.eq('status', 'candidate');
	if (del.error) error(500, 'Could not save your rules.');
	if (rows.length) {
		const ins = await supabase.from('brand_rules').insert(rows);
		if (ins.error) error(500, 'Could not save your rules.');
	}
}

export const actions: Actions = {
	...keyActions,
	...profileActions,
	/** Review step: stated_rules → drafts, saved as candidates so a refresh keeps them. */
	generate: async ({ locals }) => {
		const userId = locals.user!.id;
		await requireAIKeys(userId, 'llm');
		const { profile } = await loadBrand(locals.supabase, userId);
		try {
			const drafts = await generateStatedRules(userId, profile);
			await replaceDrafts(
				locals,
				drafts.map((d) => ruleRow(userId, d, 'onboarding', 'candidate'))
			);
			return { drafts };
		} catch (e) {
			return aiFail(e);
		}
	},
	/** "Looks right": the edited list becomes active rules, onboarding is complete → Home. */
	finish: async ({ request, locals }) => {
		const { supabase, user } = locals;
		const drafts = parseDrafts((await request.formData()).get('rules'));
		if (!drafts) return fail(400, { message: 'Some rules are empty or too long.' });
		await replaceDrafts(locals, []);
		if (drafts.length) {
			const ins = await supabase
				.from('brand_rules')
				.insert(drafts.map((d) => ruleRow(user!.id, d, 'onboarding', 'active')));
			if (ins.error) return fail(500, { message: 'Could not save your rules.' });
		}
		const now = new Date().toISOString();
		const done = await supabase
			.from('brand_profile')
			.update({ onboarding_completed_at: now })
			.eq('user_id', user!.id);
		if (done.error) return fail(500, { message: 'Could not finish onboarding. Try again.' });
		await supabase.from('profiles').update({ onboarded_at: now }).eq('id', user!.id);
		redirect(303, '/');
	}
};
