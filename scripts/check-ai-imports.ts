// Docs: docs/llm.md
// Every AI call goes through the adapters (docs/llm.md). Fails `pnpm check` when app code:
// 1. imports a provider SDK, 2. calls a provider API host outside the adapter folders,
// 3. reads a server AI key env var outside the demo-key modules (BYOK only, ADR 0008).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', '.svelte-kit', '.venv', '__pycache__', 'tests', '.vercel', 'build']);
const SOURCE = /\.(ts|js|svelte|py)$/;
const ADAPTERS = ['apps/web/src/lib/server/llm/', 'apps/worker/worker/llm/', 'apps/worker/worker/transcription/'];
const DEMO_KEY_MODULES = ['apps/web/src/lib/server/llm/keys.ts', 'apps/worker/worker/llm/keys.py'];

const SDK =
	/from ['"](@anthropic-ai\/sdk|@google\/genai|@google\/generative-ai|groq-sdk|@deepgram\/sdk|openai)['"]|^\s*(import|from) (anthropic|groq|deepgram|openai|google\.genai|google\.generativeai)\b/m;
const HOST = /api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.deepgram\.com/;
const BANNED_ENV = /\b(ANTHROPIC_API_KEY|CLAUDE_OAUTH_TOKEN|DEEPGRAM_API_KEY)\b/;
const DEMO_ENV = /\b(GEMINI_API_KEY|GROQ_API_KEY)\b/;

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		if (SKIP.has(e.name)) return [];
		const p = join(dir, e.name);
		return e.isDirectory() ? walk(p) : SOURCE.test(e.name) ? [p] : [];
	});
}

const errors: string[] = [];
for (const file of ['apps/web/src', 'apps/worker', 'packages', 'scripts'].flatMap((d) => walk(join(root, d)))) {
	const rel = relative(root, file);
	if (/\.test\.ts$|^scripts\/check-ai-imports\.ts$/.test(rel)) continue;
	const src = readFileSync(file, 'utf8');
	const inAdapter = ADAPTERS.some((a) => rel.startsWith(a));
	if (SDK.test(src)) errors.push(`${rel}: provider SDK import (use the adapters, raw HTTP)`);
	if (!inAdapter && HOST.test(src)) errors.push(`${rel}: provider API call outside the adapters`);
	if (BANNED_ENV.test(src)) errors.push(`${rel}: server AI key env var (BYOK only, ADR 0008)`);
	if (!DEMO_KEY_MODULES.includes(rel) && DEMO_ENV.test(src))
		errors.push(`${rel}: demo key env var outside the demo-key modules`);
}

if (errors.length) {
	console.error(`AI adapter check failed (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
	process.exit(1);
}
console.log('AI adapter check passed.');
