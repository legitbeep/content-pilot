import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '../../.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// shadcn-svelte components are generated; callers pass already-resolved hrefs.
		files: ['src/lib/shared/ui/**'],
		rules: { 'svelte/no-navigation-without-resolve': 'off' }
	},
	{
		// Secret-key guard (docs/auth-and-keys.md): SUPABASE_SECRET_KEY and private env may only be
		// read from server-only modules. SvelteKit also refuses $env/*/private in client bundles.
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: ['src/lib/server/**', 'src/**/*.server.{ts,js}', 'src/routes/**/+server.{ts,js}'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'Identifier[name="SUPABASE_SECRET_KEY"]',
					message:
						'SUPABASE_SECRET_KEY is server-only: use it from $lib/server or a *.server.ts file.'
				},
				{
					selector: 'Literal[value="SUPABASE_SECRET_KEY"]',
					message:
						'SUPABASE_SECRET_KEY is server-only: use it from $lib/server or a *.server.ts file.'
				}
			],
			'no-restricted-imports': [
				'error',
				{
					paths: ['$env/static/private', '$env/dynamic/private'].map((name) => ({
						name,
						message: 'Private env is server-only: import it from $lib/server or a *.server.ts file.'
					}))
				}
			]
		}
	}
);
