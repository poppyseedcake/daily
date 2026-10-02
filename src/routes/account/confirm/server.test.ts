import { describe, expect, test } from 'vitest';
import { GET, POST } from './+server';

describe('retired account confirmation route', () => {
  test('returns existing users to Daily without another legal prompt', () => {
    expect(GET).toThrow(expect.objectContaining({ status: 303, location: '/' }));
    expect(POST).toThrow(expect.objectContaining({ status: 303, location: '/' }));
  });
});
