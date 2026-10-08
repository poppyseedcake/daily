import { get, writable } from 'svelte/store';

export const cookieConsentStorageKey = 'daily.cookieConsent.v1';
export const cookieConsentLifetime = 180 * 24 * 60 * 60 * 1_000;
export type CookieConsent = 'pending' | 'accepted' | 'rejected';

export const cookieConsent = writable<CookieConsent>('pending');
export const cookieSettingsOpen = writable(false);

export function readCookieConsent(storage: Pick<Storage, 'getItem'>, now = Date.now()): CookieConsent {
  try {
    const value = JSON.parse(storage.getItem(cookieConsentStorageKey) ?? 'null');
    if (
      (value?.analytics === 'accepted' || value?.analytics === 'rejected') &&
      typeof value.updatedAt === 'number' &&
      value.updatedAt <= now &&
      now - value.updatedAt < cookieConsentLifetime
    ) {
      return value.analytics;
    }
  } catch {
    // Missing, blocked or invalid storage means analytics stays off.
  }
  return 'pending';
}

export function initializeCookieConsent() {
  const refresh = () => {
    try {
      cookieConsent.set(readCookieConsent(window.localStorage));
    } catch {
      cookieConsent.set('pending');
    }
  };
  refresh();
  window.addEventListener('storage', (event) => {
    if (event.key === cookieConsentStorageKey || event.key === null) refresh();
  });
}

export function chooseCookieConsent(choice: Exclude<CookieConsent, 'pending'>) {
  try {
    window.localStorage.setItem(
      cookieConsentStorageKey,
      JSON.stringify({ analytics: choice, updatedAt: Date.now() })
    );
  } catch {
    // The choice still applies to this visit when storage is blocked.
  }
  cookieConsent.set(choice);
  cookieSettingsOpen.set(false);
}

export const analyticsAllowed = () => get(cookieConsent) === 'accepted';
