// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { AICapabilities } from '$lib/entities/api-key';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			session?: Session | null;
			/** Set by the shell layout; read by <RequiresAI> (docs/llm.md). */
			ai?: AICapabilities;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
