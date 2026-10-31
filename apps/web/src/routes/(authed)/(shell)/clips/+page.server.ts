// Docs: docs/product/pages.md
// /clips alone (nav, breadcrumb, palette) opens the latest finished job's picker.
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data: job } = await supabase
		.from('jobs')
		.select('id')
		.eq('status', 'done')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (job) redirect(303, `/clips/${job.id}`);
};
