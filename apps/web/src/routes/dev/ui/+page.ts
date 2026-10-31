import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// Design system review page: dev only.
export const load = () => {
	if (!dev) error(404);
};
