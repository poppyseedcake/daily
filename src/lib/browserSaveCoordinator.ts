export type BrowserSaveFailureReason = 'invalid' | 'network' | 'unavailable';

type JsonPrimitive = boolean | null | number | string;
export type JsonSaveState =
  | JsonPrimitive
  | JsonSaveState[]
  | { [key: string]: JsonSaveState | undefined };

export type BrowserSaveAttempt =
  | { outcome: 'saved' }
  | { outcome: 'failed'; reason: BrowserSaveFailureReason };

export type BrowserSaveAdapter<State extends JsonSaveState> = {
  save(state: State): Promise<BrowserSaveAttempt>;
};

export const createJsonPutSaveAdapter = <State extends JsonSaveState>({
  url,
  body = (state: State) => state
}: {
  url: string;
  body?: (state: State) => unknown;
}): BrowserSaveAdapter<State> => ({
  async save(state) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body(state))
      });

      return response.ok
        ? { outcome: 'saved' }
        : {
            outcome: 'failed',
            reason: response.status === 400 ? 'invalid' : 'unavailable'
          };
    } catch {
      return { outcome: 'failed', reason: 'network' };
    }
  }
});

export type BrowserSaveCompletion<State extends JsonSaveState> =
  | { outcome: 'saved'; state: State }
  | { outcome: 'superseded'; state: State }
  | {
      outcome: 'failed';
      state: State;
      rollback: State;
      reason: BrowserSaveFailureReason;
    };

export type BrowserSaveRequest<State extends JsonSaveState> =
  | { outcome: 'unchanged' }
  | { outcome: 'queued'; completion: Promise<BrowserSaveCompletion<State>> };

type CapturedState<State extends JsonSaveState> = {
  key: string;
  value: State;
};

export const createBrowserSaveCoordinator = <State extends JsonSaveState>({
  initialState,
  adapter
}: {
  initialState: State;
  adapter: BrowserSaveAdapter<State>;
}) => {
  let persisted = captureJsonState(initialState);
  let latestSequence = 0;
  let queue = Promise.resolve();
  let pendingCount = 0;
  let latestRequest: {
    key: string;
    completion: Promise<BrowserSaveCompletion<State>>;
  } | null = null;

  const save = (state: State): BrowserSaveRequest<State> => {
    const captured = captureJsonState(state);

    if (latestRequest?.key === captured.key) {
      return { outcome: 'queued', completion: latestRequest.completion };
    }

    if (pendingCount === 0 && captured.key === persisted.key) {
      return { outcome: 'unchanged' };
    }

    const sequence = ++latestSequence;
    let complete!: (result: BrowserSaveCompletion<State>) => void;
    const completion = new Promise<BrowserSaveCompletion<State>>((resolve) => {
      complete = resolve;
    });
    pendingCount += 1;
    latestRequest = { key: captured.key, completion };

    queue = queue.then(async () => {
      let attempt: BrowserSaveAttempt;

      try {
        attempt = await adapter.save(captured.value);
      } catch {
        attempt = { outcome: 'failed', reason: 'network' };
      }

      if (attempt.outcome === 'saved') {
        persisted = captured;
      }

      const result: BrowserSaveCompletion<State> = sequence !== latestSequence
        ? { outcome: 'superseded', state: captured.value }
        : attempt.outcome === 'saved'
          ? { outcome: 'saved', state: captured.value }
          : {
              outcome: 'failed',
              state: captured.value,
              rollback: persisted.value,
              reason: attempt.reason
            };

      pendingCount -= 1;
      if (latestRequest?.completion === completion) {
        latestRequest = null;
      }
      complete(result);
    });

    return { outcome: 'queued', completion };
  };

  return { save };
};

const captureJsonState = <State extends JsonSaveState>(state: State): CapturedState<State> => {
  const key = JSON.stringify(state);

  if (key === undefined) {
    throw new TypeError('Browser save state must be JSON-serializable.');
  }

  return {
    key,
    value: JSON.parse(key) as State
  };
};
