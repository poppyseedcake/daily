import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

export const getServerPostHogClient = () => {
  if (posthogClient) return posthogClient;

  const token = process.env.PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once PUBLIC_POSTHOG_PROJECT_TOKEN is configured'
      );
    }
    return null;
  }

  const host = process.env.PUBLIC_POSTHOG_HOST;
  if (!host) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once PUBLIC_POSTHOG_HOST is configured'
      );
    }
    return null;
  }

  posthogClient = new PostHog(token, {
    host,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
    privacyMode: false
  });

  return posthogClient;
};
