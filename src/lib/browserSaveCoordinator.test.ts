import { describe, expect, test } from 'vitest';
import {
  createBrowserSaveCoordinator,
  type BrowserSaveAttempt,
  type BrowserSaveRequest
} from './browserSaveCoordinator';

type SavedState = { value: string };

const queued = (request: BrowserSaveRequest<SavedState>) => {
  expect(request.outcome).toBe('queued');
  if (request.outcome !== 'queued') throw new Error('Expected a queued save.');
  return request.completion;
};

const deferred = <Value>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

describe('Browser save coordinator', () => {
  test('serializes delayed saves and leaves the latest state persisted', async () => {
    const firstAttempt = deferred<BrowserSaveAttempt>();
    let persisted = { value: 'initial' };
    let attempt = 0;
    const coordinator = createBrowserSaveCoordinator({
      initialState: persisted,
      adapter: {
        async save(state) {
          attempt += 1;
          if (attempt === 1) await firstAttempt.promise;
          persisted = state;
          return { outcome: 'saved' };
        }
      }
    });

    const first = queued(coordinator.save({ value: 'first' }));
    const latest = queued(coordinator.save({ value: 'latest' }));

    expect(persisted).toEqual({ value: 'initial' });
    firstAttempt.resolve({ outcome: 'saved' });

    await expect(first).resolves.toEqual({ outcome: 'superseded', state: { value: 'first' } });
    await expect(latest).resolves.toEqual({ outcome: 'saved', state: { value: 'latest' } });
    expect(persisted).toEqual({ value: 'latest' });
  });

  test('deduplicates an unchanged state and repeated queued state', async () => {
    const attempt = deferred<BrowserSaveAttempt>();
    let saves = 0;
    const coordinator = createBrowserSaveCoordinator<SavedState>({
      initialState: { value: 'initial' },
      adapter: {
        async save() {
          saves += 1;
          return attempt.promise;
        }
      }
    });

    expect(coordinator.save({ value: 'initial' })).toEqual({ outcome: 'unchanged' });
    const first = coordinator.save({ value: 'next' });
    const duplicate = coordinator.save({ value: 'next' });

    expect(first.outcome).toBe('queued');
    expect(duplicate.outcome).toBe('queued');
    if (first.outcome !== 'queued' || duplicate.outcome !== 'queued') {
      throw new Error('Expected queued saves.');
    }
    expect(duplicate.completion).toBe(first.completion);

    attempt.resolve({ outcome: 'saved' });
    await expect(first.completion).resolves.toEqual({ outcome: 'saved', state: { value: 'next' } });
    expect(saves).toBe(1);
  });

  test('persists a state requested again after a different queued state', async () => {
    const firstAttempt = deferred<void>();
    let persisted = { value: 'initial' };
    let saves = 0;
    const coordinator = createBrowserSaveCoordinator<SavedState>({
      initialState: persisted,
      adapter: {
        async save(state) {
          saves += 1;
          if (saves === 1) await firstAttempt.promise;
          persisted = state;
          return { outcome: 'saved' };
        }
      }
    });

    const first = queued(coordinator.save({ value: 'first' }));
    const middle = queued(coordinator.save({ value: 'middle' }));
    const latest = queued(coordinator.save({ value: 'first' }));
    firstAttempt.resolve();

    await Promise.all([first, middle, latest]);
    expect(persisted).toEqual({ value: 'first' });
    expect(saves).toBe(3);
  });

  test('returns the last persisted state for rollback after the latest save fails', async () => {
    const coordinator = createBrowserSaveCoordinator<SavedState>({
      initialState: { value: 'initial' },
      adapter: {
        async save(state) {
          return state.value === 'saved'
            ? { outcome: 'saved' }
            : { outcome: 'failed', reason: 'unavailable' };
        }
      }
    });

    await expect(queued(coordinator.save({ value: 'saved' }))).resolves.toEqual({
      outcome: 'saved',
      state: { value: 'saved' }
    });
    await expect(queued(coordinator.save({ value: 'rejected' }))).resolves.toEqual({
      outcome: 'failed',
      state: { value: 'rejected' },
      rollback: { value: 'saved' },
      reason: 'unavailable'
    });
  });

  test('does not expose rollback for a failed save that a newer state supersedes', async () => {
    const firstAttempt = deferred<BrowserSaveAttempt>();
    let persisted = { value: 'initial' };
    let attempt = 0;
    const coordinator = createBrowserSaveCoordinator<SavedState>({
      initialState: persisted,
      adapter: {
        async save(state) {
          attempt += 1;
          const result = attempt === 1
            ? await firstAttempt.promise
            : { outcome: 'saved' as const };
          if (result.outcome === 'saved') persisted = state;
          return result;
        }
      }
    });

    const stale = queued(coordinator.save({ value: 'stale' }));
    const latest = queued(coordinator.save({ value: 'latest' }));
    firstAttempt.resolve({ outcome: 'failed', reason: 'invalid' });

    await expect(stale).resolves.toEqual({ outcome: 'superseded', state: { value: 'stale' } });
    await expect(latest).resolves.toEqual({ outcome: 'saved', state: { value: 'latest' } });
    expect(persisted).toEqual({ value: 'latest' });
  });
});
