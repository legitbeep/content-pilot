<!-- Docs: docs/brand-memory.md
A stated rule vs. a learned pattern that contradicts it. The user picks; never auto-override.
Plan 7 wires the callbacks (keep → archive the candidate, update → replace the stated rule). -->
<script lang="ts">
	import { Button } from '$lib/shared/ui/button';

	let {
		stated,
		learned,
		evidence = 0,
		onkeep,
		onupdate
	}: {
		stated: string;
		learned: string;
		/** How many edits/posts the learned pattern comes from. */
		evidence?: number;
		onkeep: () => void;
		onupdate: () => void;
	} = $props();
</script>

<div class="flex flex-col gap-3 rounded-lg border bg-surface p-4">
	<div class="grid gap-3 sm:grid-cols-2">
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">You told us</span>
			<p>{stated}</p>
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">
				What you do{evidence ? `, seen ${evidence} times` : ''}
			</span>
			<p>{learned}</p>
		</div>
	</div>
	<div class="flex justify-end gap-2">
		<Button variant="ghost" size="sm" onclick={onkeep}>Keep mine</Button>
		<Button variant="outline" size="sm" onclick={onupdate}>Update rule</Button>
	</div>
</div>
