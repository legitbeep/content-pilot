// Docs: docs/llm.md
// Typed view of registry.json: the only place model ids live (worker copy: worker/llm/registry.json).
import registry from '../registry.json' with { type: 'json' };

export type LLMProvider = 'anthropic' | 'gemini' | 'groq';
export type TranscriptionProvider = 'deepgram' | 'groq';
export type Tier = 'smart' | 'fast';
export type Task = keyof typeof registry.tasks;
export type JsonMode = 'instructions' | 'mime_type' | 'json_schema';
export type TierInfo = { model: string; max_input_tokens: number; max_output_tokens: number };

export const LLM_PROVIDERS: LLMProvider[] = ['anthropic', 'gemini', 'groq'];
export const TRANSCRIPTION_PROVIDERS: TranscriptionProvider[] = ['deepgram', 'groq'];
export const TASKS = Object.keys(registry.tasks) as Task[];

export const llm = registry.llm as Record<
	LLMProvider,
	{ name: string; json_mode: JsonMode; tiers: Record<Tier, TierInfo> }
>;
export const transcription = registry.transcription as Record<
	TranscriptionProvider,
	{ name: string; model: string; max_file_bytes?: number }
>;

export const tierOf = (task: Task) => registry.tasks[task] as Tier;
export const modelFor = (provider: LLMProvider, task: Task) => llm[provider].tiers[tierOf(task)];
