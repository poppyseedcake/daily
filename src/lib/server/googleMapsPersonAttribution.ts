import { createHmac } from 'node:crypto';
import type { GoogleMapsPersonAttribution } from './googleMapsRequestGateway';

type VisitorRequestAttribution = {
  clientAddress: string;
  userAgent: string;
};

export type GoogleMapsAttributionAuthState =
  | { mode: 'visitor' }
  | {
      mode: 'user';
      userId: string;
      summaryRecipient?: string;
    };

export type GoogleMapsPersonAttributionOptions = {
  authState: GoogleMapsAttributionAuthState;
  visitorRequest?: VisitorRequestAttribution;
  secret: string;
};

export const createGoogleMapsPersonAttribution = ({
  authState,
  visitorRequest,
  secret
}: GoogleMapsPersonAttributionOptions): GoogleMapsPersonAttribution => {
  if (Buffer.byteLength(secret) < 32) {
    throw new Error('Google Maps attribution secret must contain at least 32 bytes');
  }

  let privateIdentity: string;

  if (authState.mode === 'user') {
    privateIdentity = `user:${authState.userId}`;
  } else {
    const clientAddress = visitorRequest?.clientAddress.trim();
    const userAgent = visitorRequest?.userAgent.trim().toLowerCase();

    if (!clientAddress || !userAgent) {
      throw new Error('Visitor Google Maps attribution requires trusted request metadata');
    }

    privateIdentity = `visitor:${clientAddress}\0${userAgent}`;
  }

  return {
    personUsageIdentity: createHmac('sha256', secret).update(privateIdentity).digest('base64url')
  };
};
