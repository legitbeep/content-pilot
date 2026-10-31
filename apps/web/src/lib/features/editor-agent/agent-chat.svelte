<!-- Docs: docs/agent.md
Editor agent chat (plan 6's agent slot): message → SSE plan from /api/editor/agent → checklist the
editor runs through `host.apply(op, args, 'agent')`. Mic (Wispr / Groq via the server) only when
the user has a voice key; hold V to talk. -->
<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import MicIcon from '@lucide/svelte/icons/mic';
	import XIcon from '@lucide/svelte/icons/x';
	import { RequiresAI } from '$lib/entities/api-key';
	import type { Word } from '$lib/entities/timeline';
	import { editorKeys, comboOf } from '$lib/shared/config';
	import { isTyping } from '$lib/shared/lib/is-typing';
	import { Button } from '$lib/shared/ui/button';
	import { Textarea } from '$lib/shared/ui/textarea';
	import { cn } from '$lib/shared/lib/utils';
	import { OpError } from '$lib/entities/timeline';
	import { resolveRefs, runStep, type AgentHost, type PlanStep, type StepResult } from './model';
	import { startRecording } from './voice';

	let {
		host,
		clipId,
		wordsByKey
	}: { host: AgentHost; clipId: string; wordsByKey: Record<string, Word[]> } = $props();

	type StepState = { step: PlanStep; state: 'pending' | 'done' | 'failed'; note?: string };
	type Turn = {
		id: number;
		message: string;
		status: 'thinking' | 'confirm' | 'running' | 'done' | 'failed' | 'cancelled';
		statusText: string;
		reply: string;
		steps: StepState[];
		sideNotes: string[];
		error: string;
		applied: number;
		endPresent: unknown;
		undone: boolean;
	};

	let turns = $state<Turn[]>([]);
	let input = $state('');
	let busy = $state(false);
	let recording = $state<null | (() => Promise<string>)>(null);
	let transcribing = $state(false);
	let list: HTMLElement | undefined = $state();
	const results: Record<number, Record<string, StepResult>> = {};

	const scroll = () => queueMicrotask(() => list?.scrollTo({ top: list.scrollHeight }));

	async function send() {
		const message = input.trim();
		if (!message || busy) return;
		input = '';
		busy = true;
		const turn: Turn = {
			id: Date.now(),
			message,
			status: 'thinking',
			statusText: 'Sending…',
			reply: '',
			steps: [],
			sideNotes: [],
			error: '',
			applied: 0,
			endPresent: null,
			undone: false
		};
		turns.push(turn);
		const t = turns[turns.length - 1];
		scroll();
		try {
			const res = await fetch('/api/editor/agent', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ clipId, message, timeline: host.timeline })
			});
			if (!res.ok || !res.body)
				throw new Error(
					((await res.json().catch(() => null)) as { message?: string } | null)?.message ??
						'The agent is unavailable. Try again.'
				);
			const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
			let buf = '';
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += value;
				let i;
				while ((i = buf.indexOf('\n\n')) >= 0) {
					const raw = buf.slice(0, i);
					buf = buf.slice(i + 2);
					const event = raw.match(/^event: (.*)$/m)?.[1];
					const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] ?? 'null');
					onEvent(t, event, data);
				}
			}
			if (t.status === 'thinking') t.status = 'failed';
		} catch (e) {
			t.status = 'failed';
			t.error = e instanceof Error ? e.message : 'The agent is unavailable. Try again.';
		} finally {
			busy = false;
			scroll();
		}
	}

	function onEvent(t: Turn, event: string | undefined, data: Record<string, unknown>) {
		if (event === 'status') t.statusText = String(data.text);
		else if (event === 'understood') t.sideNotes = (data.side_notes as string[]) ?? [];
		else if (event === 'error') {
			t.status = 'failed';
			t.error = String(data.message);
		} else if (event === 'plan') {
			t.reply = String(data.reply ?? '');
			t.steps = (data.steps as PlanStep[]).map((step) => ({ step, state: 'pending' }));
			if (!t.steps.length) t.status = 'done';
			else if (data.destructive) t.status = 'confirm';
			else void run(t);
		}
		scroll();
	}

	async function run(t: Turn) {
		t.status = 'running';
		t.error = '';
		const res = (results[t.id] ??= {});
		for (const s of t.steps) {
			if (s.state === 'done') continue;
			try {
				const r = runStep(host.timeline, s.step, res, { clipId, wordsByKey, keys: [] });
				if (r.kind === 'op') {
					if (!host.apply(s.step.tool, resolveRefs(s.step.args, res), 'agent'))
						throw new OpError('The editor rejected this step.');
					t.applied++;
					t.endPresent = host.history.present;
				} else if (r.kind === 'memory') {
					await propose(r.proposal, t.message);
				}
				res[s.step.id] = r;
				s.state = 'done';
				s.note = r.kind === 'op' ? undefined : r.summary;
			} catch (e) {
				s.state = 'failed';
				t.status = 'failed';
				t.error = e instanceof Error ? e.message : 'This step failed.';
				return;
			}
		}
		t.status = 'done';
	}

	async function propose(proposal: { rule: string; scope: string }, message: string) {
		const res = await fetch('/api/editor/propose', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ clipId, message, ...proposal })
		});
		if (!res.ok) throw new Error('Could not save the rule suggestion.');
	}

	function undoPlan(t: Turn) {
		if (host.history.present !== t.endPresent) {
			toast.error('You edited after this plan. Use Undo to step back instead.');
			return;
		}
		for (let i = 0; i < t.applied; i++) host.undo();
		t.undone = true;
		toast.success('Undid the plan.');
	}

	// ---- Voice
	const canVoice = $derived(!!page.data.ai?.voice);
	async function startTalk() {
		if (recording || transcribing) return;
		try {
			recording = await startRecording();
		} catch {
			toast.error('Microphone not available. Type instead.');
		}
	}
	async function stopTalk() {
		const stop = recording;
		if (!stop) return;
		recording = null;
		transcribing = true;
		try {
			const text = await stop();
			if (text) input = input ? `${input} ${text}` : text;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Voice input failed. Type instead.');
		} finally {
			transcribing = false;
		}
	}
	const isTalkKey = (e: KeyboardEvent) => editorKeys[comboOf(e)] === 'talk';
</script>

<svelte:window
	onkeydown={(e) => {
		if (canVoice && isTalkKey(e) && !e.repeat && !isTyping(e.target)) void startTalk();
	}}
	onkeyup={(e) => {
		if (recording && e.key.toLowerCase() === 'v') void stopTalk();
	}}
/>

<section data-slot="agent-chat" class="mt-auto flex min-h-72 flex-col gap-2 border-t pt-3">
	<div>
		<h2 class="text-xs font-medium text-muted-foreground">Editor agent</h2>
		<p class="text-xs text-muted-foreground">Finds moments by what's said, not by visuals.</p>
	</div>

	<div bind:this={list} class="flex max-h-96 min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
		{#each turns as t (t.id)}
			<div class="flex flex-col gap-2">
				<p class="self-end rounded-md bg-elevated px-2 py-1.5 text-sm">{t.message}</p>
				{#if t.status === 'thinking'}
					<p class="text-xs text-muted-foreground">{t.statusText}</p>
				{/if}
				{#if t.reply}<p class="text-sm">{t.reply}</p>{/if}
				{#if t.steps.length}
					<ul class="flex flex-col gap-1 rounded-md border p-2">
						{#each t.steps as s (s.step.id)}
							<li class="flex items-start gap-2 text-sm">
								{#if s.state === 'done'}
									<CheckIcon class="mt-0.5 size-3.5 text-success" />
								{:else if s.state === 'failed'}
									<XIcon class="mt-0.5 size-3.5 text-danger" />
								{:else}
									<CircleIcon class="mt-0.5 size-3.5 text-muted-foreground" />
								{/if}
								<span class={cn(t.undone && 'text-muted-foreground line-through')}>
									{s.step.summary}
									{#if s.note}<span class="block text-xs text-muted-foreground">{s.note}</span>{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if t.error}<p class="text-xs text-danger">{t.error}</p>{/if}
				{#if t.sideNotes.length}
					<div class="flex flex-wrap gap-1">
						{#each t.sideNotes as note, i (i)}
							<span
								class="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs text-muted-foreground"
							>
								Also heard: {note}
								<button type="button" aria-label="Dismiss" onclick={() => t.sideNotes.splice(i, 1)}>
									<XIcon class="size-3" />
								</button>
							</span>
						{/each}
					</div>
				{/if}
				<div class="flex gap-2">
					{#if t.status === 'confirm'}
						<Button size="sm" variant="outline" onclick={() => run(t)}>Confirm</Button>
						<Button size="sm" variant="ghost" onclick={() => (t.status = 'cancelled')}>
							Cancel
						</Button>
					{:else if t.status === 'failed' && t.steps.some((s) => s.state === 'failed')}
						<Button size="sm" variant="outline" onclick={() => run(t)}>Retry</Button>
					{/if}
					{#if t.applied && !t.undone && t.status !== 'running'}
						<Button size="sm" variant="ghost" onclick={() => undoPlan(t)}>Undo plan</Button>
					{/if}
				</div>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">
				Ask for edits in plain words, e.g. “make it vertical and lower the music to 20%”.
			</p>
		{/each}
	</div>

	<form
		class="flex flex-col gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			void send();
		}}
	>
		<Textarea
			bind:value={input}
			rows={2}
			maxlength={4000}
			placeholder={recording ? 'Listening…' : 'Tell the agent what to change'}
			aria-label="Message the editor agent"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					void send();
				}
			}}
		/>
		<div class="flex items-center justify-end gap-2">
			{#if canVoice}
				<RequiresAI need="voice">
					{#snippet children({ disabled })}
						<Button
							type="button"
							size="sm"
							variant={recording ? 'secondary' : 'ghost'}
							disabled={disabled || transcribing}
							aria-pressed={!!recording}
							aria-label={recording ? 'Stop recording' : 'Record a voice message (hold V)'}
							onclick={() => (recording ? stopTalk() : startTalk())}
						>
							<MicIcon class={cn(recording && 'text-danger')} />
							{transcribing ? 'Transcribing…' : recording ? 'Stop' : ''}
						</Button>
					{/snippet}
				</RequiresAI>
			{/if}
			<RequiresAI need="llm">
				{#snippet children({ disabled })}
					<Button
						type="submit"
						size="sm"
						variant="outline"
						disabled={disabled || busy || !input.trim()}
					>
						Send
					</Button>
				{/snippet}
			</RequiresAI>
		</div>
	</form>
</section>
