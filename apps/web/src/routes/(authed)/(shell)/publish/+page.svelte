<script lang="ts">
	import { resolve } from '$app/paths';
	import SendIcon from '@lucide/svelte/icons/send';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
	import { cn } from '$lib/shared/lib/utils';
	import { PublishForm } from '$lib/features/publish-clip';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let selectedId = $state<string | null>(null);
	const clip = $derived(data.clips.find((c) => c.id === selectedId) ?? data.clips[0]);
</script>

<PageHeader title="Publish" description="Post a rendered clip or schedule it." />

{#if !clip}
	<EmptyState
		icon={SendIcon}
		text="No rendered clips waiting. Render a clip in the editor to publish it."
		action={{ label: 'Open calendar', href: resolve('/calendar') }}
	/>
{:else}
	<div class="grid gap-6 md:grid-cols-[260px_1fr]">
		<ul class="flex flex-col gap-1" aria-label="Rendered clips">
			{#each data.clips as c (c.id)}
				<li>
					<button
						type="button"
						onclick={() => (selectedId = c.id)}
						aria-current={c.id === clip.id}
						class={cn(
							'flex w-full gap-3 rounded-md border border-transparent p-2 text-left hover:bg-elevated',
							c.id === clip.id && 'border-border-strong bg-elevated'
						)}
					>
						<video
							src={c.preview}
							preload="metadata"
							muted
							class="h-16 w-9 rounded-sm bg-black object-cover"
						></video>
						<span class="line-clamp-3 text-sm">{c.description}</span>
					</button>
				</li>
			{/each}
		</ul>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video src={clip.preview} controls class="aspect-[9/16] w-full rounded-lg border bg-black"
			></video>
			{#key clip.id}
				<PublishForm {clip} youtube={data.youtube} />
			{/key}
		</div>
	</div>
{/if}
