<script lang="ts">
	import { formatTimecode } from './format';

	let { seconds, whole = false }: { seconds: number; whole?: boolean } = $props();
</script>

<span class="font-mono text-xs tabular-nums">{formatTimecode(seconds, { whole })}</span>
