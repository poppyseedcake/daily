import { createHmac, randomBytes } from 'node:crypto';
import type { DailyPageAuthState } from './pageAuthState';
import type { GoogleMapsPersonAttribution } from './googleMapsRequestGateway';

const visitorCookieName = 'daily-maps-visitor';

type AttributionCookies = {
  get: (name: string) => string | undefined;
  set: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      sameSite: 'lax';
      secure: boolean;
      path: string;
      maxAge: number;
    }
  ) => void;
};

export type GoogleMapsPersonAttributionOptions = {
  authState: DailyPageAuthState;
  cookies: AttributionCookies;
  secret: string;
};

export const createGoogleMapsPersonAttribution = ({
  authState,
  cookies,
  secret
}: GoogleMapsPersonAttributionOptions): GoogleMapsPersonAttribution => {
  if (Buffer.byteLength(secret) < 32) {
    throw new Error('Google Maps attribution secret must contain at least 32 bytes');
  }

  let privateIdentity: string;

  if (authState.mode === 'user') {
    privateIdentity = `user:${authState.userId}`;
  } else {
    let visitorIdentity = cookies.get(visitorCookieName);

    if (!visitorIdentity) {
      visitorIdentity = randomBytes(32).toString('base64url');
      cookies.set(visitorCookieName, visitorIdentity, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 365
      });
    }

    privateIdentity = `visitor:${visitorIdentity}`;
  }

  return {
    personUsageIdentity: createHmac('sha256', secret).update(privateIdentity).digest('base64url')
  };
};
