// Docs: docs/INDEX.md
// Keeps docs and code linked. Run: `node scripts/check-docs.ts` (part of `pnpm check`).
// `--hook`: Claude Code Stop hook mode — prints {"decision":"block"} JSON instead of exiting 1.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', '.svelte-kit', '.venv', '__pycache__', '.git', '.pytest_cache', '.ruff_cache', 'build', '.vercel', '.worktrees']);
const SOURCE = /\.(ts|js|svelte|py|sql|json)$/;
const DOCS_REF = /Docs: (docs\/[\w./-]+\.md)/g;
const errors: string[] = [];

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		if (SKIP.has(e.name)) return [];
		const p = join(dir, e.name);
		return e.isDirectory() ? walk(p) : [p];
	});
}
const rel = (p: string) => relative(root, p);

// 1. Every doc has frontmatter with covers + last_updated, and every covered path exists.
const docs = walk(join(root, 'docs')).filter((p) => p.endsWith('.md'));
for (const doc of docs) {
	const fm = readFileSync(doc, 'utf8').match(/^---\n([\s\S]*?)\n---/);
	if (!fm || !/^covers:/m.test(fm[1]) || !/^last_updated:/m.test(fm[1])) {
		errors.push(`${rel(doc)}: missing frontmatter with covers: and last_updated:`);
		continue;
	}
	const covers = [...fm[1].matchAll(/^\s+- (.+)$/gm)].map((m) => m[1].trim());
	for (const c of covers) {
		if (!existsSync(join(root, c))) errors.push(`${rel(doc)}: covers path does not exist: ${c}`);
	}
}

// 2. Every doc is listed in docs/INDEX.md.
const index = readFileSync(join(root, 'docs/INDEX.md'), 'utf8');
for (const doc of docs) {
	const name = relative(join(root, 'docs'), doc);
	if (name !== 'INDEX.md' && !index.includes(`\`${name}\``)) errors.push(`docs/INDEX.md: missing ${name}`);
}

// 3. Every `Docs:` header in code points to an existing doc.
const sources = ['apps', 'packages', 'scripts', 'supabase'].flatMap((d) => walk(join(root, d))).filter((p) => SOURCE.test(p));
for (const file of sources) {
	for (const [, ref] of readFileSync(file, 'utf8').matchAll(DOCS_REF)) {
		if (!existsSync(join(root, ref))) errors.push(`${rel(file)}: Docs header points to missing ${ref}`);
	}
}

// 4. Top-level modules under these dirs start with a `Docs:` header (first 3 lines).
const MODULE_DIRS: [string, string[]][] = [
	['apps/web/src/lib', ['index.ts', 'index.js']],
	['apps/worker/pipeline', ['__init__.py']]
];
for (const [dir, entries] of MODULE_DIRS) {
	for (const name of readdirSync(join(root, dir))) {
		if (SKIP.has(name)) continue;
		const p = join(root, dir, name);
		const entry = statSync(p).isDirectory() ? entries.map((e) => join(p, e)).find(existsSync) : p;
		const head = entry ? readFileSync(entry, 'utf8').split('\n').slice(0, 3).join('\n') : '';
		if (!/Docs: docs\//.test(head)) errors.push(`${dir}/${name}: module entry has no "Docs:" header`);
	}
}

const hook = process.argv.includes('--hook');
if (hook) {
	const input = (() => {
		try {
			return JSON.parse(readFileSync(0, 'utf8') || '{}');
		} catch {
			return {};
		}
	})();
	// Already blocked once this turn: let Claude stop rather than loop.
	if (errors.length && !input.stop_hook_active) {
		console.log(JSON.stringify({ decision: 'block', reason: `Docs check failed — fix before finishing:\n${errors.join('\n')}` }));
	}
	process.exit(0);
}
if (errors.length) {
	console.error(`Docs check failed (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
	process.exit(1);
}
console.log(`Docs check passed (${docs.length} docs, ${sources.length} source files).`);
