<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import StarIcon from '@lucide/svelte/icons/star';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import { formAction } from '$lib/shared/lib/form-action';
	import { cn } from '$lib/shared/lib/utils';

	let { post, score }: { post: { id: string; title: string | null }; score: number } = $props();
	let rating = $state(0);
	let note = $state('');
	let busy = $state(false);

	async function save() {
		busy = true;
		try {
			await formAction('rate', { post_id: post.id, rating, note });
			toast.success('Thanks. Your rating counts as extra evidence.');
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not save the rating.');
		} finally {
			busy = false;
		}
	}
</script>

<section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
	<p>
		<span class="font-medium">{post.title ?? 'A clip'}</span> got {score.toFixed(1)}x your usual
		views after 7 days. How happy are you with it?
	</p>
	<div class="flex flex-wrap items-center gap-3">
		<div class="flex" role="radiogroup" aria-label="Rating, 1 to 5 stars">
			{#each [1, 2, 3, 4, 5] as n (n)}
				<button
					type="button"
					role="radio"
					aria-checked={rating === n}
					aria-label="{n} star{n === 1 ? '' : 's'}"
					onclick={() => (rating = n)}
					class="rounded-sm p-1 text-muted-foreground hover:text-foreground"
				>
					<StarIcon class={cn(n <= rating && 'fill-current text-foreground')} />
				</button>
			{/each}
		</div>
		<Input
			bind:value={note}
			placeholder="Why? (optional)"
			maxlength={300}
			class="w-64"
			aria-label="Note"
		/>
		<Button variant="outline" size="sm" onclick={save} disabled={busy || !rating}
			>Save rating</Button
		>
	</div>
</section>
