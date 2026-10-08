import { dev } from '$app/environment';
import { PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_PROJECT_TOKEN } from '$env/static/public';
import type { HandleClientError } from '@sveltejs/kit';
import posthog from 'posthog-js';
import { maskReplayAttribute } from '$lib/posthogReplayPrivacy';

export function init() {
  if (!PUBLIC_POSTHOG_PROJECT_TOKEN) {
    if (dev) {
      throw new Error(
        'PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once PUBLIC_POSTHOG_PROJECT_TOKEN is configured'
      );
    }
    return;
  }

  if (!PUBLIC_POSTHOG_HOST) {
    if (dev) {
      throw new Error(
        'PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once PUBLIC_POSTHOG_HOST is configured'
      );
    }
    return;
  }

  posthog.init(PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: PUBLIC_POSTHOG_HOST,
    defaults: '2026-01-30',
    // Product events are captured explicitly; DOM labels can contain private User content.
    autocapture: false,
    capture_dead_clicks: false,
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
    tracing_headers: [window.location.hostname],
    logs: {
      serviceName: 'daily-web',
      environment: dev ? 'development' : 'production'
    }
  });
}

export const handleError: HandleClientError = ({ error, status, message }) => {
  posthog.captureException(error);

  return { message, status };
};
