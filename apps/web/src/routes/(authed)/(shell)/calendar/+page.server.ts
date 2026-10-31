import { fail } from '@sveltejs/kit';
import { canPost, type Post, type PostAction, type PostStatus } from '$lib/entities/post';
import { presignGet } from '$lib/server/r2';
import type { Actions, PageServerLoad } from './$types';

type Row = Post & { clips: { render_path: string | null; description: string | null } | null };

export const load: PageServerLoad = async ({ locals: { supabase }, depends }) => {
	depends('app:posts');
	// ponytail: all of the user's posts, filtered in the browser; page by month if this grows.
	const { data, error } = await supabase
		.from('posts')
		.select('*, clips(render_path, description)')
		.neq('status', 'draft')
		.order('scheduled_at', { ascending: false });
	if (error) console.error('posts', error);
	return {
		posts: await Promise.all(
			((data ?? []) as Row[]).map(async ({ clips, ...p }) => ({
				...p,
				preview: clips?.render_path ? await presignGet(clips.render_path) : null
			}))
		)
	};
};

type Ctx = Parameters<Actions[string]>[0];
const statusesFor = (action: PostAction) =>
	(['scheduled', 'failed', 'cancelled'] as PostStatus[]).filter((s) => canPost(s, action));

/** Update the user's post (RLS) only if its status still allows `action`; the status filter in
 * the update makes it atomic against the worker claiming it meanwhile. */
async function act(
	{ request, locals: { supabase } }: Ctx,
	action: PostAction,
	build: (form: FormData, post: Post) => Record<string, unknown> | string
) {
	const form = await request.formData();
	const id = String(form.get('id') ?? '');
	const { data: post } = await supabase.from('posts').select('*').eq('id', id).maybeSingle();
	if (!post) return fail(404, { message: 'Post not found.' });
	if (!canPost(post.status, action))
		return fail(409, { message: `Can't ${action} a ${post.status} post.` });
	const fields = build(form, post as Post);
	if (typeof fields === 'string') return fail(400, { message: fields });

	if (fields.status === 'scheduled' && post.status !== 'scheduled') {
		const { data: live } = await supabase
			.from('posts')
			.select('id')
			.eq('clip_id', post.clip_id)
			.eq('platform', post.platform)
			.in('status', ['scheduled', 'publishing', 'posted']);
		if (live?.length) return fail(409, { message: 'This clip already has a live post.' });
	}
	const { data, error } = await supabase
		.from('posts')
		.update({ ...fields, updated_at: new Date().toISOString() })
		.eq('id', id)
		.in('status', statusesFor(action))
		.select('id');
	if (error) {
		console.error('posts update', error);
		return fail(500, { message: 'Could not update the post. Try again.' });
	}
	if (!data?.length)
		return fail(409, { message: 'The post changed meanwhile. Refresh and try again.' });
	return { ok: true };
}

function futureTime(v: FormDataEntryValue | null): Date | string {
	const d = new Date(String(v ?? ''));
	if (Number.isNaN(d.getTime())) return 'Pick a valid date and time.';
	if (d.getTime() < Date.now() - 60_000) return 'Pick a time in the future.';
	return d;
}

export const actions: Actions = {
	reschedule: (ctx) =>
		act(ctx, 'reschedule', (form) => {
			const when = futureTime(form.get('scheduled_at'));
			if (typeof when === 'string') return when;
			return { status: 'scheduled', scheduled_at: when.toISOString(), attempts: 0, error: null };
		}),
	edit: (ctx) =>
		act(ctx, 'edit', (form) => {
			const title = String(form.get('title') ?? '')
				.replace(/[<>]/g, '')
				.trim();
			const caption = String(form.get('caption') ?? '').replace(/[<>]/g, '');
			if (!title || title.length > 100) return 'Titles need 1 to 100 characters.';
			if (caption.length > 5000) return 'Descriptions can be at most 5000 characters.';
			return { title, caption };
		}),
	cancel: (ctx) => act(ctx, 'cancel', () => ({ status: 'cancelled' })),
	retry: (ctx) =>
		act(ctx, 'retry', () => ({
			status: 'scheduled',
			scheduled_at: new Date().toISOString(),
			attempts: 0,
			error: null
		}))
};
