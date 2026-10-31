// Docs: docs/auth-and-keys.md
// Server-wide Claude client for AI steps (editor agent). Auth: CLAUDE_OAUTH_TOKEN (ADR 0007).
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

export const CLAUDE_MODEL = 'claude-opus-5-5';

export function claude(): Anthropic {
	const token = env.CLAUDE_OAUTH_TOKEN;
	if (!token) throw new Error('CLAUDE_OAUTH_TOKEN is not set (apps/web/.env)');
	// OAuth tokens go in `Authorization: Bearer` and need the oauth beta header.
	// apiKey: null stops the SDK from also picking up a stray ANTHROPIC_API_KEY.
	return new Anthropic({
		apiKey: null,
		authToken: token,
		defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' }
	});
}
