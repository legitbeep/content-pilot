import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Timeline } from './index.ts';

const dir = join(import.meta.dirname, '../fixtures');
const load = (kind: string) =>
	readdirSync(join(dir, kind)).map((f) => [f, JSON.parse(readFileSync(join(dir, kind, f), 'utf8'))]);

describe('zod mirror vs shared fixtures', () => {
	it.each(load('valid'))('accepts valid/%s', (_, data) => {
		expect(Timeline.safeParse(data).success).toBe(true);
	});
	it.each(load('invalid'))('rejects invalid/%s', (_, data) => {
		expect(Timeline.safeParse(data).success).toBe(false);
	});
});
