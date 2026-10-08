export const dailyTermsVersion = '2026-10-08';

export const legalConfirmationCookieName = 'daily.legal_confirmation';
export const legalConfirmationCookieMaxAgeSeconds = 15 * 60;

export type LegalConfirmation = {
  termsAcceptedAt: string;
  termsVersion: string;
};
