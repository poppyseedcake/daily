import { describe, expect, test } from 'vitest';
import {
  persistDailyUserIdentity,
  type DailyUserIdentity,
  type DailyUserIdentityStore
} from './dailyUserIdentity';

const validIdentity = (): DailyUserIdentity => ({
  id: 'auth-user-1',
  googleSubject: 'google-subject-1',
  email: 'user@example.com'
});

const createStore = ({ fail = false }: { fail?: boolean } = {}): DailyUserIdentityStore & {
  saved: DailyUserIdentity[];
} => ({
  saved: [],
  async upsertGoogleUser(identity) {
    if (fail) {
      throw new Error('store failed');
    }

    this.saved.push(identity);
  }
});

describe('Daily User identity persistence', () => {
  test('stores the Google subject and verified email for a Daily User', async () => {
    const store = createStore();
    const identity = validIdentity();

    const result = await persistDailyUserIdentity(store, identity);

    expect(result.outcome).toBe('stored');
    expect(store.saved).toEqual([identity]);
  });

  test('rejects incomplete Google identity data before writing', async () => {
    const store = createStore();
    const identity = { ...validIdentity(), googleSubject: '' };

    const result = await persistDailyUserIdentity(store, identity);

    expect(result.outcome).toBe('invalid-identity');
    expect(store.saved).toEqual([]);
  });

  test('reports persistence failures without leaking the store error', async () => {
    const store = createStore({ fail: true });

    const result = await persistDailyUserIdentity(store, validIdentity());

    expect(result.outcome).toBe('store-failed');
    expect(store.saved).toEqual([]);
  });
});
