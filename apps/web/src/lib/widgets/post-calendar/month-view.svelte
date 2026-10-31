<script lang="ts">
	import * as Popover from '$lib/shared/ui/popover';
	import { cn } from '$lib/shared/lib/utils';
	import { PostStatusBadge, platformName, statusDot } from '$lib/entities/post';
	import { dayKey, monthGrid, postTime } from './calendar';
	import type { CalPost } from './types';

	let { posts, month, onopen }: { posts: CalPost[]; month: string; onopen: (id: string) => void } =
		$props();

	const byDay = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt by $derived, never mutated after
		const m = new Map<string, CalPost[]>();
		for (const p of posts) {
			const k = dayKey(postTime(p));
			m.set(k, [...(m.get(k) ?? []), p]);
		}
		for (const list of m.values()) list.sort((a, b) => +postTime(a) - +postTime(b));
		return m;
	});
	const today = dayKey(new Date());
	const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const time = (p: CalPost) =>
		postTime(p).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	let openDay = $state<string | null>(null);
</script>

<div class="rounded-lg border">
	<div class="grid grid-cols-7 border-b text-xs text-muted-foreground">
		{#each weekdays as d (d)}<div class="px-2 py-1.5">{d}</div>{/each}
	</div>
	<div class="grid grid-cols-7">
		{#each monthGrid(month) as day, i (i)}
			{@const key = day && dayKey(day)}
			{@const list = (key && byDay.get(key)) || []}
			<div class={cn('h-24 border-r border-b p-1', i % 7 === 6 && 'border-r-0')}>
				{#if day && key}
					{#if list.length}
						<Popover.Root open={openDay === key} onOpenChange={(o) => (openDay = o ? key : null)}>
							<Popover.Trigger
								class="flex h-full w-full flex-col items-start gap-1 rounded-md p-1 text-left hover:bg-elevated"
								aria-label={`${day.toLocaleDateString()}: ${list.length} posts`}
							>
								<span
									class={cn(
										'text-xs',
										key === today && 'font-semibold text-foreground',
										key !== today && 'text-muted-foreground'
									)}
								>
									{day.getDate()}
								</span>
								<span class="flex flex-wrap gap-1">
									{#each list.slice(0, 6) as p (p.id)}
										<span class={cn('size-2 rounded-full', statusDot[p.status])}></span>
									{/each}
									{#if list.length > 6}<span class="text-xs text-muted-foreground"
											>+{list.length - 6}</span
										>{/if}
								</span>
							</Popover.Trigger>
							<Popover.Content class="w-72 p-1" align="start">
								<ul class="flex flex-col">
									{#each list as p (p.id)}
										<li>
											<button
												type="button"
												class="flex w-full flex-col gap-1 rounded-md p-2 text-left hover:bg-elevated"
												onclick={() => {
													openDay = null;
													onopen(p.id);
												}}
											>
												<span class="truncate font-medium">{p.title || 'Untitled'}</span>
												<span class="flex items-center gap-2 text-xs text-muted-foreground">
													{time(p)} · {platformName(p.platform)}
													<PostStatusBadge status={p.status} />
												</span>
											</button>
										</li>
									{/each}
								</ul>
							</Popover.Content>
						</Popover.Root>
					{:else}
						<span
							class={cn(
								'block p-1 text-xs',
								key === today ? 'font-semibold' : 'text-muted-foreground'
							)}
						>
							{day.getDate()}
						</span>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
</div>
