import { PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_PROJECT_TOKEN } from '$env/static/public';
import type { PostHog } from 'posthog-js';
import { analyticsAllowed, cookieConsent } from './cookieConsent';
import { maskReplayAttribute } from './posthogReplayPrivacy';

let client: PostHog | undefined;
let loading: Promise<void> | undefined;
let userId: string | undefined;

function synchronizeIdentity() {
  if (!client || !analyticsAllowed()) return;
  const identifiedUserId = client.get_property('$user_id');
  if (identifiedUserId && identifiedUserId !== userId) client.reset();
  if (userId) client.identify(userId);
}

const enableAnalytics = async () => {
  if (!PUBLIC_POSTHOG_PROJECT_TOKEN || !PUBLIC_POSTHOG_HOST || !analyticsAllowed()) return;
  let newlyInitialized = false;
  if (!client) {
    const { default: posthog } = await import('posthog-js');
    // Consent may have changed while the SDK was loading.
    if (!analyticsAllowed()) return;
    client = posthog.init(PUBLIC_POSTHOG_PROJECT_TOKEN, {
      api_host: PUBLIC_POSTHOG_HOST,
      defaults: '2026-01-30',
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      cross_subdomain_cookie: false,
      cookie_expiration: 180,
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      enable_recording_console_log: false,
      session_recording: {
        maskAllInputs: true,
        // Mark User content at its rendering boundary; keep application copy readable.
        // Form values stay masked even before they are saved or rendered elsewhere.
        maskTextSelector: '[data-private], #dnd-action-aria-alert, textarea, select, option',
        // Global attribute masking also destroys CSS classes, styles, and stylesheet links.
        maskAllElementAttributes: false,
        maskAttributeFn: maskReplayAttribute,
        recordHeaders: false,
        recordBody: false
      },
      capture_exceptions: true,
      person_profiles: 'identified_only',
      save_campaign_params: false,
      logs: { captureConsoleLogs: false, beforeSend: () => null },
      metrics: { network: false, beforeSend: () => null },
      before_send: (event) => {
        if (!event || !analyticsAllowed()) return null;
        // Authentication redirects can contain OAuth codes and state in the URL.
        const stripUrlDetails = (properties: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(properties)) {
            if (typeof value === 'string' && /url|referrer/.test(key)) {
              try {
                const url = new URL(value);
                properties[key] = `${url.origin}${url.pathname}`;
              } catch { /* Non-URL properties remain unchanged. */ }
            }
          }
        };
        stripUrlDetails(event.properties);
        for (const key of ['$set', '$set_once'] as const) {
          const personProperties = event[key];
          if (personProperties) stripUrlDetails(personProperties);
          const properties = event.properties[key];
          if (properties && typeof properties === 'object') stripUrlDetails(properties);
        }
        return event;
      }
    });
    newlyInitialized = true;
  }
  if (!client || !analyticsAllowed()) return;
  const wasOptedIn = client.has_opted_in_capturing();
  client.set_config({ disable_persistence: false });
  client.opt_in_capturing({ captureEventName: false });
  synchronizeIdentity();
  if (newlyInitialized || !wasOptedIn) client.capture('$pageview');
};

export function initializeAnalytics() {
  cookieConsent.subscribe((choice) => {
    if (choice === 'accepted') {
      loading ??= enableAnalytics().catch(() => {
        // Analytics failures must not prevent use of Daily.
      }).finally(() => { loading = undefined; });
    } else if (client) {
      client.opt_out_capturing();
      client.set_config({ disable_persistence: true });
    }
  });
}

// Never queue interactions that happened before consent or SDK initialization.
export const analytics = {
  getUserId() {
    return userId;
  },
  capture(event: string, properties?: Record<string, unknown>) {
    if (analyticsAllowed()) client?.capture(event, properties);
  },
  identify(id: string) {
    userId = id;
    synchronizeIdentity();
  },
  reset() {
    userId = undefined;
    synchronizeIdentity();
  },
  captureException(error: unknown) {
    if (analyticsAllowed()) client?.captureException(error);
  }
};
