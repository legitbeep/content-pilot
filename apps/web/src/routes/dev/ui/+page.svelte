<script lang="ts">
	// Docs: docs/design/design-system.md
	// Every token and component in every state. Add new shared/ui components here.
	import type { DateValue } from '@internationalized/date';
	import { toast } from 'svelte-sonner';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { AppShell } from '$lib/widgets/app-shell';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
	import { StatusBadge, type JobStatus } from '$lib/shared/ui/status-badge';
	import { Timecode } from '$lib/shared/ui/timecode';
	import { DataTable, type Column } from '$lib/shared/ui/data-table';
	import { TopbarActions } from '$lib/shared/ui/topbar-actions';
	import * as Kbd from '$lib/shared/ui/kbd';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import { Textarea } from '$lib/shared/ui/textarea';
	import { Label } from '$lib/shared/ui/label';
	import { Badge } from '$lib/shared/ui/badge';
	import { Switch } from '$lib/shared/ui/switch';
	import { Slider } from '$lib/shared/ui/slider';
	import { Separator } from '$lib/shared/ui/separator';
	import { Skeleton } from '$lib/shared/ui/skeleton';
	import { Calendar } from '$lib/shared/ui/calendar';
	import { ScrollArea } from '$lib/shared/ui/scroll-area';
	import * as Select from '$lib/shared/ui/select';
	import * as Tabs from '$lib/shared/ui/tabs';
	import * as Tooltip from '$lib/shared/ui/tooltip';
	import * as Dialog from '$lib/shared/ui/dialog';
	import * as Popover from '$lib/shared/ui/popover';
	import * as DropdownMenu from '$lib/shared/ui/dropdown-menu';
	import * as Avatar from '$lib/shared/ui/avatar';
	import * as Command from '$lib/shared/ui/command';
	import { ChipsInput } from '$lib/shared/ui/chips-input';
	import { CodeInput } from '$lib/shared/ui/code-input';
	import { Card } from '$lib/shared/ui/card';
	import { CopyButton } from '$lib/shared/ui/copy-button';
	import { Stat } from '$lib/shared/ui/stat';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { ConflictCard } from '$lib/entities/brand';

	let chips = $state(['javascript', 'careers']);
	let chipsFull = $state(['one', 'two', 'three']);
	let otp = $state('');

	const tokens = [
		['--bg-canvas', 'App background'],
		['--bg-subtle', 'Inputs, table header, tab list'],
		['--bg-surface', 'Sidebar, panels, cards'],
		['--bg-elevated', 'Popovers, modals, hover rows'],
		['--border', 'Default 1px border'],
		['--border-strong', 'Focused/active containers'],
		['--text', 'Primary text'],
		['--text-muted', 'Secondary text, metadata'],
		['--accent', 'Primary button, focus, active nav, playhead'],
		['--accent-fg', 'Text on violet'],
		['--accent-text', 'Violet text and links on dark'],
		['--accent-subtle', 'Tinted violet fills'],
		['--success', 'Done'],
		['--danger', 'Failed, destructive'],
		['--info', 'Processing'],
		['--warning', 'Warnings'],
		['--caption', 'Editor caption track']
	] as const;
	const sizes = [
		['text-2xl', '24 · page titles (rare)'],
		['text-xl', '20 · page title'],
		['text-lg', '16 · section title'],
		['text-base', '14 · emphasis'],
		['text-sm', '13 · base UI'],
		['text-xs', '12 · metadata, badges']
	] as const;
	const statuses: JobStatus[] = [
		'pending',
		'processing',
		'needs_input',
		'done',
		'stopped',
		'failed'
	];

	type Row = { title: string; status: JobStatus; duration: number; id: string };
	const rows: Row[] = [
		{ title: 'Episode 42 — pricing', status: 'done', duration: 3725.4, id: 'job_8f2a' },
		{ title: 'Founder AMA', status: 'processing', duration: 1830.2, id: 'job_1c9e' },
		{ title: 'Launch livestream', status: 'needs_input', duration: 5402, id: 'job_77b0' }
	];
	const columns: Column<Row>[] = [
		{ key: 'title', label: 'Title', sortable: true },
		{ key: 'status', label: 'Status', cell: statusCell },
		{ key: 'duration', label: 'Duration', sortable: true, cell: durationCell, class: 'text-right' },
		{ key: 'id', label: 'ID', cell: idCell }
	];

	let selectValue = $state('9:16');
	let switchOn = $state(true);
	let slider = $state(40);
	let date = $state<DateValue | undefined>();
	let dialogOpen = $state(false);
	let panelOpen = $state(false);
	let fadeKey = $state(0);
</script>

{#snippet statusCell(r: Row)}<StatusBadge status={r.status} />{/snippet}
{#snippet durationCell(r: Row)}<Timecode seconds={r.duration} />{/snippet}
{#snippet idCell(r: Row)}<span class="font-mono text-xs text-muted-foreground">{r.id}</span
	>{/snippet}

{#snippet section(title: string)}
	<h2 class="mt-12 mb-4 border-b pb-2 text-lg font-semibold">{title}</h2>
{/snippet}

<AppShell user={{ email: 'dev@example.com', user_metadata: { full_name: 'Dev preview' } }}>
	<TopbarActions><Button variant="outline" size="sm">Page action</Button></TopbarActions>

	<PageHeader title="Design system" description="Every token and component in every state.">
		{#snippet actions()}<Button variant="outline" size="sm">Secondary</Button>{/snippet}
	</PageHeader>

	{@render section('Color tokens')}
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
		{#each tokens as [name, use] (name)}
			<div class="flex items-center gap-3 rounded-lg border bg-surface p-2">
				<div class="size-10 shrink-0 rounded-sm border" style="background: var({name})"></div>
				<div class="min-w-0">
					<div class="font-mono text-xs">{name}</div>
					<div class="truncate text-xs text-muted-foreground">{use}</div>
				</div>
			</div>
		{/each}
	</div>

	{@render section('Type')}
	<div class="flex flex-col gap-2">
		{#each sizes as [cls, note] (cls)}
			<div class="flex items-baseline gap-4">
				<span class="w-40 shrink-0 text-xs text-muted-foreground">{note}</span>
				<span class={cls}>Find the best moments in long videos</span>
			</div>
		{/each}
		<div class="flex items-baseline gap-4">
			<span class="w-40 shrink-0 text-xs text-muted-foreground">Weights 400 / 500 / 600</span>
			<span class="font-normal">Regular</span><span class="font-medium">Medium</span><span
				class="font-semibold">Semibold</span
			>
		</div>
		<div class="flex items-baseline gap-4">
			<span class="w-40 shrink-0 text-xs text-muted-foreground">Mono: timecodes, IDs only</span>
			<Timecode seconds={83.4} />
			<Timecode seconds={3723.5} />
			<span class="font-mono text-xs">job_8f2a</span>
		</div>
	</div>

	{@render section('Radius')}
	<div class="flex gap-4">
		{#each [['rounded-sm', '4 · inputs, badges'], ['rounded-md', '6 · buttons'], ['rounded-lg', '8 · popovers, menus'], ['rounded-xl', '12 · cards, dialogs']] as [cls, label] (cls)}
			<div class="flex flex-col items-center gap-2">
				<div class="size-16 border border-border-strong bg-surface {cls}"></div>
				<span class="text-xs text-muted-foreground">{label}</span>
			</div>
		{/each}
	</div>

	{@render section('Gradients, glow, abstract backdrop')}
	<div class="grid gap-3 sm:grid-cols-3">
		<div
			class="h-24 rounded-xl border bg-surface bg-gradient-surface p-3 text-xs text-muted-foreground"
		>
			bg-gradient-surface
		</div>
		<div class="flex h-24 flex-col justify-end rounded-xl border bg-surface p-3">
			<div class="mb-2 h-0.5 w-16 rounded-full bg-gradient-accent"></div>
			<span class="text-xs text-muted-foreground">bg-gradient-accent (thin marks only)</span>
		</div>
		<div class="flex h-24 items-center justify-center rounded-xl border bg-surface shadow-glow">
			<span class="text-xs text-muted-foreground">shadow-glow</span>
		</div>
	</div>
	<div class="relative mt-3 overflow-hidden rounded-xl border bg-surface bg-abstract p-8">
		<h3 class="text-lg font-semibold tracking-tight">bg-abstract</h3>
		<p class="text-muted-foreground">Behind page heroes, empty states, dropzones and login.</p>
	</div>

	{@render section('Motion')}
	<div class="flex flex-wrap items-center gap-3">
		{#key fadeKey}
			<div class="animate-in-fade rounded-lg border bg-surface px-3 py-2 text-xs">
				animate-in-fade
			</div>
		{/key}
		<Button variant="outline" size="sm" onclick={() => fadeKey++}>Replay</Button>
		<Skeleton class="h-8 w-40" />
		<span class="text-xs text-muted-foreground">Skeleton shimmer</span>
	</div>

	{@render section('Buttons')}
	<div class="flex flex-wrap items-center gap-2">
		<Button>Primary</Button>
		<Button variant="outline">Outline</Button>
		<Button variant="secondary">Secondary</Button>
		<Button variant="ghost">Ghost</Button>
		<Button variant="destructive">Delete</Button>
		<Button variant="link">Link</Button>
		<Button disabled>Disabled</Button>
		<Button size="sm" variant="outline"><PlusIcon />Small</Button>
		<Button size="icon" variant="ghost" aria-label="More"><EllipsisIcon /></Button>
	</div>
	<div class="mt-3 flex flex-wrap items-center gap-2">
		<Button size="xs" variant="outline">xs</Button>
		<Button size="sm" variant="outline">sm</Button>
		<Button variant="outline">default</Button>
		<Button size="lg" variant="outline">lg</Button>
		<Button size="lg"><UploadIcon />Upload video</Button>
		<Button href="/dev/ui" variant="outline">As link</Button>
	</div>

	{@render section('Form controls')}
	<div class="grid max-w-md gap-4">
		<div class="grid gap-1.5">
			<Label for="i1">Title</Label><Input id="i1" placeholder="Clip title" />
		</div>
		<div class="grid gap-1.5">
			<Label for="i2">Invalid</Label><Input id="i2" aria-invalid="true" value="Too long" />
		</div>
		<div class="grid gap-1.5">
			<Label for="i3">Disabled</Label><Input id="i3" disabled value="Read only" />
		</div>
		<div class="grid gap-1.5">
			<Label for="t1">Description</Label><Textarea id="t1" placeholder="What is this clip about?" />
		</div>
		<div class="grid gap-1.5">
			<Label>Export ratio</Label>
			<Select.Root type="single" bind:value={selectValue}>
				<Select.Trigger class="w-48">{selectValue}</Select.Trigger>
				<Select.Content>
					<Select.Item value="9:16">9:16 · Shorts, Reels, TikTok</Select.Item>
					<Select.Item value="1:1">1:1 · Instagram, LinkedIn</Select.Item>
					<Select.Item value="16:9">16:9 · YouTube, X</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
		<div class="flex items-center gap-2">
			<Switch id="s1" bind:checked={switchOn} /><Label for="s1">Burn in captions</Label>
		</div>
		<div class="flex items-center gap-2">
			<Switch id="s2" disabled /><Label for="s2">Disabled</Label>
		</div>
		<div class="grid gap-1.5">
			<Label>Volume {slider}</Label>
			<Slider type="single" bind:value={slider} max={100} step={1} />
		</div>
	</div>

	{@render section('Status and badges')}
	<div class="flex flex-wrap gap-2">
		{#each statuses as s (s)}<StatusBadge status={s} />{/each}
	</div>
	<div class="mt-3 flex flex-wrap gap-2">
		<Badge variant="accent">Suggested</Badge>
		<Badge variant="secondary">Secondary</Badge>
		<Badge variant="outline">Outline</Badge>
		<Badge variant="destructive">Destructive</Badge>
	</div>

	{@render section('Keyboard hints')}
	<div class="flex items-center gap-4">
		<Kbd.Group><Kbd.Root>⌘</Kbd.Root><Kbd.Root>K</Kbd.Root></Kbd.Group>
		<Kbd.Group><Kbd.Root>G</Kbd.Root><Kbd.Root>Q</Kbd.Root></Kbd.Group>
		<Kbd.Root>?</Kbd.Root>
	</div>

	{@render section('Tabs')}
	<Tabs.Root value="clips">
		<Tabs.List>
			<Tabs.Trigger value="clips">Clips</Tabs.Trigger>
			<Tabs.Trigger value="transcript">Transcript</Tabs.Trigger>
			<Tabs.Trigger value="disabled" disabled>Disabled</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="clips" class="pt-2 text-muted-foreground">Clips tab content.</Tabs.Content>
		<Tabs.Content value="transcript" class="pt-2 text-muted-foreground"
			>Transcript tab content.</Tabs.Content
		>
	</Tabs.Root>
	<Tabs.Root value="all" class="mt-4">
		<Tabs.List variant="line">
			<Tabs.Trigger value="all">All</Tabs.Trigger>
			<Tabs.Trigger value="scheduled">Scheduled</Tabs.Trigger>
			<Tabs.Trigger value="published">Published</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	{@render section('Card, stat, copy button')}
	<div class="grid gap-4 sm:grid-cols-3">
		<Card><Stat label="Clips made" value={128} delta={12} hint="vs last 7 days" /></Card>
		<Card><Stat label="Avg. views" value="2.4k" delta={-3} /></Card>
		<Card><Stat label="Scheduled" value={6} hint="next in 2 h" /></Card>
	</div>
	<div class="mt-4 grid gap-4 sm:grid-cols-2">
		<Card title="Episode 42 — pricing" description="Uploaded 2 days ago · 1:02:05">
			{#snippet actions()}
				<StatusBadge status="done" />
			{/snippet}
			<div class="flex items-center gap-1 text-xs text-muted-foreground">
				<span class="font-mono">job_8f2a91c4</span>
				<CopyButton value="job_8f2a91c4" label="Copy job ID" />
			</div>
		</Card>
		<Card href="/dev/ui" title="Clickable card" description="Whole card is a link; hover lifts it.">
			<span class="text-xs text-muted-foreground">No nested links inside.</span>
		</Card>
	</div>

	{@render section('Overlays')}
	<div class="flex flex-wrap gap-2">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}<Button {...props} variant="outline">Tooltip</Button>{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Saved 2 minutes ago</Tooltip.Content>
		</Tooltip.Root>

		<Dialog.Root bind:open={dialogOpen}>
			<Dialog.Trigger>
				{#snippet child({ props })}<Button {...props} variant="outline">Dialog</Button>{/snippet}
			</Dialog.Trigger>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Stop this job?</Dialog.Title>
					<Dialog.Description
						>It stops after the current step. You can retry it later.</Dialog.Description
					>
				</Dialog.Header>
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
					<Button variant="destructive" onclick={() => (dialogOpen = false)}>Stop job</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<Dialog.Root bind:open={panelOpen}>
			<Dialog.Trigger>
				{#snippet child({ props })}<Button {...props} variant="outline">Panel dialog</Button
					>{/snippet}
			</Dialog.Trigger>
			<Dialog.Content size="lg">
				<Dialog.Header>
					<Dialog.Title>Clip details</Dialog.Title>
					<Dialog.Description>Why this moment was picked.</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body class="flex flex-col divide-y p-0 [&>section]:px-5 [&>section]:py-4">
					{#each ['Hook', 'Reason', 'Transcript'] as h (h)}
						<section class="flex flex-col gap-2">
							<h3 class="text-xs font-medium text-muted-foreground">{h}</h3>
							<p>Fixed header and footer; only this body scrolls.</p>
						</section>
					{/each}
				</Dialog.Body>
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (panelOpen = false)}>Close</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}<Button {...props} variant="outline">Popover</Button>{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-auto p-0">
				<Calendar type="single" bind:value={date} />
			</Popover.Content>
		</Popover.Root>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}<Button {...props} variant="outline">Dropdown</Button>{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content>
				<DropdownMenu.Item>Rename</DropdownMenu.Item>
				<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
				<DropdownMenu.Item disabled>Disabled</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive">Delete</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<Button variant="outline" onclick={() => toast('Clip saved')}>Toast</Button>
		<Button variant="outline" onclick={() => toast.success('Rendered')}>Success toast</Button>
		<Button variant="outline" onclick={() => toast.error('Render failed')}>Error toast</Button>
	</div>

	{@render section('Command (inline)')}
	<Command.Root class="max-w-md rounded-lg border">
		<Command.Input autofocus={false} placeholder="Type a command or search" />
		<Command.List>
			<Command.Empty>No results.</Command.Empty>
			<Command.Group heading="Actions">
				<Command.Item>New job</Command.Item>
				<Command.Item>Open settings</Command.Item>
			</Command.Group>
		</Command.List>
	</Command.Root>

	{@render section('Calendar')}
	<Calendar type="single" bind:value={date} class="w-fit rounded-lg border" />

	{@render section('Avatar, skeleton, separator, scroll area')}
	<div class="flex items-center gap-4">
		<Avatar.Root class="rounded-sm"
			><Avatar.Fallback class="rounded-sm">DP</Avatar.Fallback></Avatar.Root
		>
		<div class="flex flex-col gap-2">
			<Skeleton class="h-4 w-48" /><Skeleton class="h-4 w-32" />
		</div>
		<Separator orientation="vertical" class="data-vertical:h-10 data-vertical:self-center" />
		<ScrollArea class="h-24 w-56 rounded-lg border p-2">
			{#each Array.from({ length: 12 }, (_, i) => i + 1) as n (n)}
				<div class="py-0.5 text-muted-foreground">Transcript line {n}</div>
			{/each}
		</ScrollArea>
	</div>

	{@render section('Data table')}
	<DataTable {columns} {rows} />
	<div class="mt-4">
		<DataTable {columns} rows={[]}>
			{#snippet empty()}Nothing scheduled.{/snippet}
		</DataTable>
	</div>

	{@render section('Chips input')}
	<div class="flex max-w-md flex-col gap-4">
		<ChipsInput bind:value={chips} max={5} label="Add a topic" />
		<ChipsInput value={[]} label="Empty" placeholder="Empty: type and press Enter" />
		<ChipsInput bind:value={chipsFull} max={3} label="Full" />
		<ChipsInput value={['locked']} label="Disabled" disabled />
	</div>

	{@render section('Code input')}
	<div class="flex flex-col items-start gap-4">
		<CodeInput bind:value={otp} label="Empty" />
		<CodeInput value="4821" label="Partly filled" />
		<CodeInput value="000000" label="Invalid" invalid />
		<CodeInput value="482913" label="Disabled" disabled />
	</div>

	{@render section('Conflict card (entities/brand)')}
	<div class="max-w-2xl">
		<ConflictCard
			stated="Keep clips under 30 seconds."
			learned="You keep extending clips to about 45 seconds."
			evidence={4}
			onkeep={() => toast('Kept your rule')}
			onupdate={() => toast('Rule updated')}
		/>
	</div>

	{@render section('Empty state')}
	<EmptyState
		icon={InboxIcon}
		text="No videos yet. Upload a long video to find clips."
		action={{ label: 'Upload video' }}
	/>
	<div class="mt-4">
		<EmptyState
			icon={InboxIcon}
			text="No brand rules yet. Finish onboarding to add your first rules."
		/>
	</div>
</AppShell>
