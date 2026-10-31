<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import * as Dialog from '$lib/shared/ui/dialog';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import { Label } from '$lib/shared/ui/label';
	import { Textarea } from '$lib/shared/ui/textarea';
	import { formAction } from '$lib/shared/lib/form-action';
	import { canPost, platformName, PostStatusBadge } from '$lib/entities/post';
	import { toLocalInput, toUtcIso } from '$lib/features/publish-clip';
	import { postTime } from './calendar';
	import type { CalPost } from './types';

	let { post, onclose }: { post: CalPost | null; onclose: () => void } = $props();

	let mode = $state<'view' | 'edit' | 'reschedule'>('view');
	let title = $state('');
	let caption = $state('');
	let at = $state('');
	let busy = $state(false);

	// Reset the form whenever another post opens.
	const openId = $derived(post?.id);
	$effect.pre(() => {
		void openId;
		mode = 'view';
	});

	function start(next: 'edit' | 'reschedule') {
		if (!post) return;
		title = post.title ?? '';
		caption = post.caption;
		const due = post.scheduled_at ? new Date(post.scheduled_at) : new Date();
		at = toLocalInput(due > new Date() ? due : new Date(Date.now() + 60 * 60_000));
		mode = next;
	}

	async function run(name: string, fields: Record<string, string> = {}, done = 'Saved.') {
		if (!post) return;
		busy = true;
		try {
			await formAction(name, { id: post.id, ...fields });
			toast.success(done);
			mode = 'view';
			await invalidate('app:posts');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Something went wrong.');
		} finally {
			busy = false;
		}
	}

	const fmt = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
</script>

<Dialog.Root open={!!post} onOpenChange={(o) => !o && onclose()}>
	<Dialog.Content class="sm:max-w-2xl">
		{#if post}
			<Dialog.Header>
				<Dialog.Title>{post.title || 'Untitled'}</Dialog.Title>
				<Dialog.Description class="flex flex-wrap items-center gap-2">
					{platformName(post.platform)} · {post.posted_at ? 'Posted' : 'Due'}
					{fmt(postTime(post))}
					<PostStatusBadge status={post.status} />
				</Dialog.Description>
			</Dialog.Header>

			<div class="grid gap-4 sm:grid-cols-[160px_1fr]">
				{#if post.preview}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video src={post.preview} controls class="aspect-[9/16] w-full rounded-lg border bg-black"
					></video>
				{:else}
					<div class="aspect-[9/16] w-full rounded-lg border bg-elevated"></div>
				{/if}

				<div class="flex min-w-0 flex-col gap-3">
					{#if post.error}
						<p class="rounded-md border border-danger/30 p-2 text-danger">{post.error}</p>
					{/if}

					{#if mode === 'edit'}
						<div class="flex flex-col gap-1.5">
							<Label for="d-title">Title</Label>
							<Input id="d-title" bind:value={title} maxlength={100} />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="d-caption">Description</Label>
							<Textarea id="d-caption" bind:value={caption} rows={8} maxlength={5000} />
						</div>
					{:else if mode === 'reschedule'}
						<div class="flex flex-col gap-1.5">
							<Label for="d-at">New date and time</Label>
							<Input id="d-at" type="datetime-local" bind:value={at} class="w-auto" />
							<span class="text-xs text-muted-foreground">
								{Intl.DateTimeFormat().resolvedOptions().timeZone}
							</span>
						</div>
					{:else}
						<p class="max-h-64 overflow-auto whitespace-pre-wrap text-muted-foreground">
							{post.caption || 'No description.'}
						</p>
						{#if post.tags.length}
							<p class="text-xs text-muted-foreground">Tags: {post.tags.join(', ')}</p>
						{/if}
					{/if}
				</div>
			</div>

			<Dialog.Footer class="flex-wrap gap-2">
				{#if mode === 'edit'}
					<Button variant="ghost" onclick={() => (mode = 'view')}>Back</Button>
					<Button disabled={busy || !title.trim()} onclick={() => run('edit', { title, caption })}>
						Save caption
					</Button>
				{:else if mode === 'reschedule'}
					<Button variant="ghost" onclick={() => (mode = 'view')}>Back</Button>
					<Button
						disabled={busy || !at}
						onclick={() => run('reschedule', { scheduled_at: toUtcIso(at) }, 'Rescheduled.')}
					>
						Reschedule
					</Button>
				{:else}
					{#if canPost(post.status, 'cancel')}
						<Button variant="ghost" disabled={busy} onclick={() => run('cancel', {}, 'Cancelled.')}>
							Cancel post
						</Button>
					{/if}
					{#if canPost(post.status, 'edit')}
						<Button variant="outline" onclick={() => start('edit')}>Edit caption</Button>
					{/if}
					{#if canPost(post.status, 'reschedule')}
						<Button variant="outline" onclick={() => start('reschedule')}>Reschedule</Button>
					{/if}
					{#if canPost(post.status, 'retry')}
						<Button disabled={busy} onclick={() => run('retry', {}, 'Retrying now.')}>Retry</Button>
					{/if}
					{#if canPost(post.status, 'open') && post.external_url}
						<Button
							href={post.external_url}
							target="_blank"
							rel="noopener noreferrer"
							variant="outline"
						>
							Open on YouTube <ExternalLinkIcon />
						</Button>
					{/if}
				{/if}
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
