import {
  loadLocalSetup,
  saveLocalSetup,
  type LocalSetupInput,
  type LocalSetupLoadOutcome,
  type LocalSetupSaveOutcome,
  type LocalSetupStorageAdapter
} from './localSetup';
import type { UserTimeZone } from './summaryConfiguration';

type Status = {
  message: string;
  tone: 'success' | 'warning' | 'error' | 'neutral';
};

type ImportOutcome = 'imported' | 'skipped-existing-setup' | 'invalid-local-setup' | 'invalid-draft' | 'import-failed';
type Navigation = {
  currentUrl(): URL;
  reload(url: URL): void;
  replaceUrl(url: URL): void;
};

type HandoffResult =
  | { outcome: 'cancelled' }
  | { outcome: 'reloading' }
  | { outcome: 'ready'; setup: LocalSetupInput; storageStatus?: Status; importStatus?: Status };

const callbackParameter = 'localSetupImport';
const importOutcomes: ImportOutcome[] = [
  'imported', 'skipped-existing-setup', 'invalid-local-setup', 'invalid-draft', 'import-failed'
];

const browserNavigation: Navigation = {
  currentUrl: () => new URL(globalThis.location.href),
  reload: (url) => globalThis.location.replace(`${url.pathname}${url.search}${url.hash}`),
  replaceUrl: (url) => globalThis.history.replaceState(
    globalThis.history.state, '', `${url.pathname}${url.search}${url.hash}`
  )
};

const importBrowserSetup = async (setup: LocalSetupInput): Promise<ImportOutcome> => {
  const response = await fetch('/local-setup-import', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(setup)
  });
  const result: unknown = await response.json();
  const outcome = result && typeof result === 'object' && 'outcome' in result ? result.outcome : undefined;
  if (response.ok && (outcome === 'imported' || outcome === 'skipped-existing-setup' || outcome === 'invalid-draft')) return outcome;
  if (response.status === 400 && (outcome === 'invalid-local-setup' || outcome === 'invalid-draft')) return outcome;
  return 'import-failed';
};

export const createLocalSetupHandoff = ({
  storage = {
    getItem: (key: string) => globalThis.localStorage.getItem(key),
    setItem: (key: string, value: string) => globalThis.localStorage.setItem(key, value)
  },
  importSetup = importBrowserSetup,
  navigation = browserNavigation
}: {
  storage?: LocalSetupStorageAdapter;
  importSetup?: (setup: LocalSetupInput) => Promise<ImportOutcome>;
  navigation?: Navigation;
} = {}) => {
  let mode: 'visitor' | 'user' | undefined;
  let ready = false;
  let hydratedSnapshot: string | undefined;
  let savedSnapshot: string | undefined;

  return {
    async initialize({
      mode: requestedMode,
      initialSetup,
      systemTimeZone,
      hasSavedSummaryConfiguration,
      signal
    }: {
      mode: 'visitor' | 'user';
      initialSetup: LocalSetupInput;
      systemTimeZone: UserTimeZone;
      hasSavedSummaryConfiguration?: boolean;
      signal?: AbortSignal;
    }): Promise<HandoffResult> {
      mode = requestedMode;
      ready = false;
      if (signal?.aborted) return { outcome: 'cancelled' };
      if (mode === 'visitor') {
        const loaded = loadLocalSetup(storage);
        const setup = loaded.outcome === 'empty'
          ? withTimeZone(loaded.setup, systemTimeZone)
          : loaded.setup;
        hydratedSnapshot = JSON.stringify(setup);
        let storageStatus = loadStatus(loaded.outcome);
        if (loaded.outcome === 'loaded') savedSnapshot = hydratedSnapshot;
        if (loaded.outcome === 'empty') {
          const saved = saveLocalSetup(storage, setup);
          storageStatus = saveStatus(saved.outcome);
          if (saved.outcome === 'saved') savedSnapshot = hydratedSnapshot;
        }
        ready = true;
        return { outcome: 'ready', setup, storageStatus };
      }

      const url = navigation.currentUrl();
      const callback = url.searchParams.get(callbackParameter);
      let importStatus: Status | undefined;
      if (callback === '1') {
        const loaded = loadLocalSetup(storage);
        if (loaded.outcome === 'loaded') {
          let outcome: ImportOutcome;
          try {
            outcome = await importSetup(loaded.setup);
          } catch {
            outcome = 'import-failed';
          }
          if (signal?.aborted) return { outcome: 'cancelled' };
          // Import can remap IDs, retain existing data, or commit before its response
          // is lost. A fresh document loads authoritative User data and save baselines.
          url.searchParams.set(callbackParameter, outcome);
          navigation.reload(url);
          return { outcome: 'reloading' };
        }
        importStatus = importResultStatus(loaded.outcome);
      } else if (importOutcomes.includes(callback as ImportOutcome)) {
        importStatus = importResultStatus(callback as ImportOutcome);
      }
      if (callback !== null) {
        url.searchParams.delete(callbackParameter);
        navigation.replaceUrl(url);
      }
      ready = true;
      return {
        outcome: 'ready',
        setup: hasSavedSummaryConfiguration === false
          ? withTimeZone(initialSetup, systemTimeZone)
          : initialSetup,
        ...(importStatus ? { importStatus } : {})
      };
    },

    save(setup: LocalSetupInput): Status | undefined {
      if (!ready || mode !== 'visitor') return;
      const snapshot = JSON.stringify(setup);
      if (snapshot === hydratedSnapshot || snapshot === savedSnapshot) return;
      const saved = saveLocalSetup(storage, setup);
      if (saved.outcome === 'saved') {
        savedSnapshot = snapshot;
        hydratedSnapshot = undefined;
      }
      return saveStatus(saved.outcome);
    }
  };
};

const withTimeZone = (setup: LocalSetupInput, userTimeZone: UserTimeZone): LocalSetupInput => ({
  ...setup,
  summaryConfiguration: { ...setup.summaryConfiguration, userTimeZone }
});

const loadStatus = (outcome: LocalSetupLoadOutcome): Status => {
  if (outcome === 'loaded') return { message: 'Restored from this browser. Saved in this browser only', tone: 'success' };
  if (outcome === 'empty') return { message: 'Not saved in this browser yet.', tone: 'neutral' };
  if (outcome === 'read-failed') return { message: 'Browser storage is unavailable. Changes are not saved.', tone: 'error' };
  return { message: 'Invalid browser data was ignored. Defaults are active.', tone: 'warning' };
};

const saveStatus = (outcome: LocalSetupSaveOutcome): Status => outcome === 'saved'
  ? { message: 'Saved in this browser only', tone: 'success' }
  : { message: 'Browser storage is unavailable. Changes are not saved.', tone: 'error' };

const importResultStatus = (outcome: LocalSetupLoadOutcome | ImportOutcome): Status => {
  if (outcome === 'imported') return { message: 'Imported Local Setup from this browser.', tone: 'success' };
  if (outcome === 'skipped-existing-setup') return { message: 'Saved User setup kept. Browser Local Setup was not imported.', tone: 'success' };
  if (outcome === 'empty') return { message: 'No browser Local Setup was found for import.', tone: 'neutral' };
  if (outcome === 'invalid-local-setup' || outcome === 'invalid-draft') {
    return { message: 'Browser Local Setup could not be imported. Saved User setup is loaded.', tone: 'warning' };
  }
  if (outcome === 'read-failed' || outcome === 'import-failed') {
    return { message: 'Browser Local Setup import could not be confirmed. Saved User setup is loaded.', tone: 'error' };
  }
  return { message: 'Invalid browser Local Setup was ignored. Saved User setup is unchanged.', tone: 'warning' };
};
