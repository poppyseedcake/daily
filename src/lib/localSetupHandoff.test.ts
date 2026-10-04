import { expect, test, vi } from 'vitest';
import { createDefaultLocalSetup, localSetupStorageKey } from './localSetup';
import { createLocalSetupHandoff } from './localSetupHandoff';

const memoryStorage = (stored: string | null) => ({
  stored,
  getItem(_key: string) { return this.stored; },
  setItem(_key: string, value: string) { this.stored = value; }
});

test('Visitor can save a change and then return to the restored Local Setup', async () => {
  const original = createDefaultLocalSetup();
  const storage = memoryStorage(JSON.stringify(original));
  const handoff = createLocalSetupHandoff({ storage });
  await handoff.initialize({ mode: 'visitor', initialSetup: original, systemTimeZone: 'Europe/Warsaw' });
  handoff.save({ ...original, summaryConfiguration: { ...original.summaryConfiguration, summaryTime: '09:00' } });
  handoff.save(original);
  expect(JSON.parse(storage.getItem(localSetupStorageKey)!)).toMatchObject({ summaryConfiguration: { summaryTime: '07:00' } });
});

test('invalid browser storage survives hydration until the Visitor edits Local Setup', async () => {
  const storage = memoryStorage('{invalid');
  const handoff = createLocalSetupHandoff({ storage });
  const result = await handoff.initialize({ mode: 'visitor', initialSetup: createDefaultLocalSetup(), systemTimeZone: 'Asia/Tokyo' });
  expect(result.outcome).toBe('ready');
  if (result.outcome !== 'ready') throw new Error('Visitor should be ready');
  handoff.save(result.setup);
  expect(storage.getItem(localSetupStorageKey)).toBe('{invalid');
  handoff.save({ ...result.setup, summaryConfiguration: { ...result.setup.summaryConfiguration, summaryTime: '08:30' } });
  expect(JSON.parse(storage.getItem(localSetupStorageKey)!)).toMatchObject({ summaryConfiguration: { summaryTime: '08:30' } });
});

test('a fresh Visitor Local Setup uses the system time zone and is saved before editing', async () => {
  const storage = memoryStorage(null);
  const handoff = createLocalSetupHandoff({ storage });
  await handoff.initialize({ mode: 'visitor', initialSetup: createDefaultLocalSetup(), systemTimeZone: 'Asia/Tokyo' });
  expect(JSON.parse(storage.getItem(localSetupStorageKey)!)).toMatchObject({ summaryConfiguration: { userTimeZone: 'Asia/Tokyo' } });
});

const memoryNavigation = (href: string) => {
  let url = new URL(href);
  return {
    currentUrl: () => new URL(url),
    reload(nextUrl: URL) { url = new URL(nextUrl); },
    replaceUrl(nextUrl: URL) { url = new URL(nextUrl); }
  };
};

test.each(['imported', 'skipped-existing-setup'] as const)('User handoff reloads saved setup after %s without enabling edits on the Visitor snapshot', async (outcome) => {
  const storage = memoryStorage(JSON.stringify(createDefaultLocalSetup()));
  const navigation = memoryNavigation('https://daily.example.com/?localSetupImport=1&calendarConnection=success#settings');
  const handoff = createLocalSetupHandoff({ storage, navigation, importSetup: async () => outcome });
  const result = await handoff.initialize({ mode: 'user', initialSetup: createDefaultLocalSetup(), systemTimeZone: 'UTC' });
  expect(result).toEqual({ outcome: 'reloading' });
  expect(navigation.currentUrl().searchParams.get('localSetupImport')).toBe(outcome);
  expect(navigation.currentUrl().searchParams.get('calendarConnection')).toBe('success');
  expect(navigation.currentUrl().hash).toBe('#settings');
  const storedBefore = storage.getItem(localSetupStorageKey);
  expect(handoff.save({ ...createDefaultLocalSetup(), nextTodoId: 20 })).toBeUndefined();
  expect(storage.getItem(localSetupStorageKey)).toBe(storedBefore);
});

test('a lost import response reloads saved User setup without repeating the import', async () => {
  const storage = memoryStorage(JSON.stringify(createDefaultLocalSetup()));
  const navigation = memoryNavigation('https://daily.example.com/?localSetupImport=1');
  const handoff = createLocalSetupHandoff({ storage, navigation, importSetup: async () => { throw new Error('Response lost after commit'); } });
  expect(await handoff.initialize({ mode: 'user', initialSetup: createDefaultLocalSetup(), systemTimeZone: 'UTC' })).toEqual({ outcome: 'reloading' });
  const savedSetup = { ...createDefaultLocalSetup(), summaryConfiguration: { ...createDefaultLocalSetup().summaryConfiguration, summaryTime: '10:00' } };
  const nextDocument = createLocalSetupHandoff({ storage, navigation, importSetup: async () => { throw new Error('Import must not repeat'); } });
  const ready = await nextDocument.initialize({ mode: 'user', initialSetup: savedSetup, systemTimeZone: 'UTC', hasSavedSummaryConfiguration: true });
  expect(ready).toMatchObject({ outcome: 'ready', setup: { summaryConfiguration: { summaryTime: '10:00' } }, importStatus: { tone: 'error' } });
  expect(navigation.currentUrl().searchParams.has('localSetupImport')).toBe(false);
});

test('an invalid import draft returned with HTTP 200 keeps its warning outcome after reload', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ outcome: 'invalid-draft' })));
  try {
    const storage = memoryStorage(JSON.stringify(createDefaultLocalSetup()));
    const navigation = memoryNavigation('https://daily.example.com/?localSetupImport=1');
    const handoff = createLocalSetupHandoff({ storage, navigation });
    expect(await handoff.initialize({ mode: 'user', initialSetup: createDefaultLocalSetup(), systemTimeZone: 'UTC' })).toEqual({ outcome: 'reloading' });
    const nextDocument = createLocalSetupHandoff({ storage, navigation });
    expect(await nextDocument.initialize({ mode: 'user', initialSetup: createDefaultLocalSetup(), systemTimeZone: 'UTC' })).toMatchObject({ outcome: 'ready', importStatus: { tone: 'warning' } });
  } finally {
    vi.unstubAllGlobals();
  }
});

test.each(['{invalid', null])('invalid or absent Local Setup never replaces saved User setup', async (stored) => {
  const savedSetup = {
    ...createDefaultLocalSetup(),
    nextTodoId: 12,
    summaryConfiguration: { ...createDefaultLocalSetup().summaryConfiguration, userTimeZone: 'Europe/Warsaw' }
  };
  const navigation = memoryNavigation('https://daily.example.com/?localSetupImport=1');
  const handoff = createLocalSetupHandoff({ storage: memoryStorage(stored), navigation, importSetup: async () => { throw new Error('Invalid storage must not be imported'); } });
  expect(await handoff.initialize({ mode: 'user', initialSetup: savedSetup, systemTimeZone: 'Asia/Tokyo', hasSavedSummaryConfiguration: true })).toMatchObject({ outcome: 'ready', setup: { nextTodoId: 12, summaryConfiguration: { userTimeZone: 'Europe/Warsaw' } } });
  expect(navigation.currentUrl().searchParams.has('localSetupImport')).toBe(false);
});

test('blocked browser storage keeps the Visitor editable and reports unsaved changes', async () => {
  const handoff = createLocalSetupHandoff({ storage: {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); }
  } });
  const initialSetup = createDefaultLocalSetup();
  expect(await handoff.initialize({ mode: 'visitor', initialSetup, systemTimeZone: 'UTC' })).toMatchObject({ outcome: 'ready', storageStatus: { tone: 'error' } });
  expect(handoff.save({ ...initialSetup, nextTodoId: 2 })).toMatchObject({ tone: 'error' });
});
