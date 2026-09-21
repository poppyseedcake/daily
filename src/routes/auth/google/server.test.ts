import { describe, expect, test } from 'vitest';

const { GET } = await import('./+server');

describe('Google sign-in route', () => {
  test('requires the legal confirmation step before Google sign-in', async () => {
    await expect(GET()).rejects.toMatchObject({ status: 303, location: '/auth/google/confirm' });
  });
});
