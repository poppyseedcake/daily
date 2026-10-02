import { describe, expect, test } from 'vitest';

const { GET } = await import('./+server');

describe('Google sign-in route', () => {
  test('opens the sign-in modal without starting OAuth or asking for Terms', async () => {
    expect(GET).toThrow(expect.objectContaining({ status: 303, location: '/?auth=signin' }));
  });
});
