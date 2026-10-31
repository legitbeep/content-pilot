<script lang="ts">
	import { formatTimecode } from './format';

	let { seconds }: { seconds: number } = $props();
</script>

<span class="font-mono text-xs tabular-nums">{formatTimecode(seconds)}</span>
