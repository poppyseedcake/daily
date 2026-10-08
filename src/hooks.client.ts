import { analytics, initializeAnalytics } from '$lib/analytics';
import { initializeCookieConsent } from '$lib/cookieConsent';
import type { HandleClientError } from '@sveltejs/kit';

export function init() {
  initializeCookieConsent();
  initializeAnalytics();
}

export const handleError: HandleClientError = ({ error, status, message }) => {
  analytics.captureException(error);

  return { message, status };
};
