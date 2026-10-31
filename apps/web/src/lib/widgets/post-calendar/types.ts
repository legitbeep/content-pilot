import type { Post } from '$lib/entities/post';

export type CalPost = Post & { preview: string | null };
