import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import {
  dailyTermsVersion,
  legalConfirmationCookieMaxAgeSeconds,
  legalConfirmationCookieName,
  type LegalConfirmation
} from '$lib/legalConfirmation';

type LegalConfirmationCookiePayload = LegalConfirmation & {
  ageConfirmed: true;
  expiresAt: number;
};

const signingSecret = () => env.BETTER_AUTH_SECRET ?? 'daily-local-build-placeholder-secret';

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const sign = (value: string) =>
  createHmac('sha256', signingSecret()).update(value).digest('base64url');

const isValidSignature = (value: string, signature: string) => {
  const expected = Buffer.from(sign(value), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const cookieHeader = (headers: Headers | HeadersInit | undefined) => {
  if (!headers) {
    return null;
  }

  return new Headers(headers).get('cookie');
};

const cookieValue = (headers: Headers | HeadersInit | undefined) => {
  const header = cookieHeader(headers);
  if (!header) {
    return null;
  }

  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) {
      continue;
    }

    const name = item.slice(0, separator).trim();
    if (name === legalConfirmationCookieName) {
      return item.slice(separator + 1).trim();
    }
  }

  return null;
};

const isValidIsoDate = (value: unknown) => {
  if (typeof value !== 'string') {
    return false;
  }

  const time = Date.parse(value);
  return Number.isFinite(time);
};

export const issueLegalConfirmationCookie = (now = new Date()) => {
  const payload: LegalConfirmationCookiePayload = {
    ageConfirmed: true,
    ageConfirmedAt: now.toISOString(),
    termsAcceptedAt: now.toISOString(),
    termsVersion: dailyTermsVersion,
    expiresAt: now.getTime() + legalConfirmationCookieMaxAgeSeconds * 1000
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
};

export const parseLegalConfirmationCookie = (
  headers: Headers | HeadersInit | undefined,
  now = new Date()
): LegalConfirmation | null => {
  const value = cookieValue(headers);
  if (!value) {
    return null;
  }

  const separator = value.lastIndexOf('.');
  if (separator < 1) {
    return null;
  }

  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!isValidSignature(encoded, signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decode(encoded)) as Partial<LegalConfirmationCookiePayload>;
    if (
      payload.ageConfirmed !== true ||
      payload.termsVersion !== dailyTermsVersion ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt < now.getTime() ||
      !isValidIsoDate(payload.ageConfirmedAt) ||
      !isValidIsoDate(payload.termsAcceptedAt)
    ) {
      return null;
    }

    const ageConfirmedAt = Date.parse(payload.ageConfirmedAt!);
    const termsAcceptedAt = Date.parse(payload.termsAcceptedAt!);
    if (ageConfirmedAt > now.getTime() || termsAcceptedAt > now.getTime()) {
      return null;
    }

    return {
      ageConfirmedAt: payload.ageConfirmedAt!,
      termsAcceptedAt: payload.termsAcceptedAt!,
      termsVersion: payload.termsVersion
    };
  } catch {
    return null;
  }
};

export const serializeLegalConfirmationCookie = (value: string, secure: boolean) =>
  [
    `${legalConfirmationCookieName}=${value}`,
    `Max-Age=${legalConfirmationCookieMaxAgeSeconds}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : ''
  ]
    .filter(Boolean)
    .join('; ');

export const serializeLegalConfirmationCookieDeletion = (secure: boolean) =>
  [
    `${legalConfirmationCookieName}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : ''
  ]
    .filter(Boolean)
    .join('; ');
