import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, test } from 'vitest';
import {
  DailyUserIdentityEmailConflictError,
  persistDailyUserIdentity,
  type DailyUserIdentity,
  type DailyUserIdentityStore
} from './dailyUserIdentity';

const validIdentity = (): DailyUserIdentity => ({
  id: 'auth-user-1',
  googleSubject: 'google-subject-1',
  email: 'user@example.com'
});

const referenceInstant = Temporal.Instant.from('2026-06-22T07:00:00Z');

const createStore = ({ fail = false }: { fail?: boolean } = {}): DailyUserIdentityStore & {
  saved: DailyUserIdentity[];
  initialSchedules: string[];
} => ({
  saved: [],
  initialSchedules: [],
  async upsertGoogleUser(identity, initialNextSummaryAt) {
    if (fail) {
      throw new Error('store failed');
    }

    this.saved.push(identity);
    this.initialSchedules.push(initialNextSummaryAt);
  }
});

describe('Daily User identity persistence', () => {
  test('stores the Google subject and verified email for a Daily User', async () => {
    const store = createStore();
    const identity = validIdentity();

    const result = await persistDailyUserIdentity(store, identity, referenceInstant);

    expect(result.outcome).toBe('stored');
    expect(store.saved).toEqual([identity]);
    expect(store.initialSchedules).toEqual(['2026-06-23T07:00:00Z']);
  });

  test('rejects incomplete Google identity data before writing', async () => {
    const store = createStore();
    const identity = { ...validIdentity(), googleSubject: '' };

    const result = await persistDailyUserIdentity(store, identity, referenceInstant);

    expect(result.outcome).toBe('invalid-identity');
    expect(store.saved).toEqual([]);
  });

  test('reports persistence failures without leaking the store error', async () => {
    const store = createStore({ fail: true });

    const result = await persistDailyUserIdentity(store, validIdentity(), referenceInstant);

    expect(result.outcome).toBe('store-failed');
    expect(store.saved).toEqual([]);
  });

  test('labels email ownership conflicts separately from generic store failures', async () => {
    const store: DailyUserIdentityStore & { saved: DailyUserIdentity[] } = {
      saved: [],
      async upsertGoogleUser(identity) {
        throw new DailyUserIdentityEmailConflictError(identity.email);
      }
    };

    const result = await persistDailyUserIdentity(store, validIdentity(), referenceInstant);

    expect(result.outcome).toBe('email-already-owned');
    expect(store.saved).toEqual([]);
  });
});
