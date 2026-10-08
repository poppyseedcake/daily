import { beforeEach, describe, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  get_property: vi.fn(), init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn(),
  captureException: vi.fn(), opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn(),
  has_opted_in_capturing: vi.fn(() => false), set_config: vi.fn()
}));
vi.mock('posthog-js', () => ({ default: sdk }));
vi.mock('$env/static/public', () => ({ PUBLIC_POSTHOG_HOST: 'https://analytics.example.test', PUBLIC_POSTHOG_PROJECT_TOKEN: 'test' }));

describe('consent-gated browser analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sdk.init.mockReturnValue(sdk);
    sdk.has_opted_in_capturing.mockReturnValue(false);
  });

  test('does not initialise, capture, identify or report errors without consent', async () => {
    const { analytics, initializeAnalytics } = await import('./analytics');
    initializeAnalytics();
    analytics.capture('before_consent');
    analytics.identify('daily-user-id');
    analytics.captureException(new Error('private error'));
    analytics.reset();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.reset).not.toHaveBeenCalled();
  });

  test('late acceptance identifies a signed-in user without sending name or email, and drops earlier interactions', async () => {
    const { analytics, initializeAnalytics } = await import('./analytics');
    const { cookieConsent } = await import('./cookieConsent');
    initializeAnalytics();
    analytics.identify('daily-user-id');
    analytics.capture('before_consent');
    cookieConsent.set('accepted');
    await vi.waitFor(() => expect(sdk.opt_in_capturing).toHaveBeenCalled());
    expect(sdk.identify).toHaveBeenCalledWith('daily-user-id');
    expect(sdk.capture).not.toHaveBeenCalledWith('before_consent', undefined);
    analytics.capture('after_consent', { storage: 'browser' });
    expect(sdk.capture).toHaveBeenCalledWith('after_consent', { storage: 'browser' });
  });

  test('withdrawal blocks all capture paths, then same-visit acceptance restores persistence', async () => {
    const { analytics, initializeAnalytics } = await import('./analytics');
    const { cookieConsent } = await import('./cookieConsent');
    initializeAnalytics();
    cookieConsent.set('accepted');
    await vi.waitFor(() => expect(sdk.opt_in_capturing).toHaveBeenCalledOnce());
    cookieConsent.set('rejected');
    expect(sdk.opt_out_capturing).toHaveBeenCalledOnce();
    expect(sdk.set_config).toHaveBeenCalledWith({ disable_persistence: true });
    sdk.capture.mockClear();
    analytics.capture('after_rejection');
    analytics.captureException(new Error('private error'));
    analytics.identify('another-user-id');
    analytics.reset();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.reset).not.toHaveBeenCalled();
    cookieConsent.set('accepted');
    await vi.waitFor(() => expect(sdk.opt_in_capturing).toHaveBeenCalledTimes(2));
    expect(sdk.set_config).toHaveBeenLastCalledWith({ disable_persistence: false });
  });

  test('records the first page view on a return visit with saved acceptance', async () => {
    sdk.has_opted_in_capturing.mockReturnValue(true);
    const { initializeAnalytics } = await import('./analytics');
    const { cookieConsent } = await import('./cookieConsent');
    cookieConsent.set('accepted');
    initializeAnalytics();
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledWith('$pageview'));
  });

  test('strips URL secrets and blocks queued events after rejection', async () => {
    const { initializeAnalytics } = await import('./analytics');
    const { cookieConsent } = await import('./cookieConsent');
    initializeAnalytics();
    cookieConsent.set('accepted');
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledOnce());
    const config = sdk.init.mock.calls[0][1];
    expect(config).toMatchObject({ autocapture: false, disable_session_recording: true, disable_surveys: true });
    const event = {
      event: '$pageview',
      properties: {
        $current_url: 'https://daily.example/auth?code=secret#private',
        $set_once: { $initial_referrer: 'https://daily.example/?token=secret' }
      },
      $set: { $current_url: 'https://daily.example/auth?code=secret#private' },
      $set_once: { $initial_current_url: 'https://daily.example/auth?code=secret#private' }
    };
    expect(config.before_send(event)).toEqual({
      event: '$pageview',
      properties: {
        $current_url: 'https://daily.example/auth',
        $set_once: { $initial_referrer: 'https://daily.example/' }
      },
      $set: { $current_url: 'https://daily.example/auth' },
      $set_once: { $initial_current_url: 'https://daily.example/auth' }
    });
    cookieConsent.set('rejected');
    expect(config.before_send(event)).toBeNull();
  });
});
