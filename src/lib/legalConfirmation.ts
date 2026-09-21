export const dailyTermsVersion = '2026-09-21';
export const minimumUserAge = 16;

export const legalConfirmationCookieName = 'daily.legal_confirmation';
export const legalConfirmationCookieMaxAgeSeconds = 15 * 60;

export type LegalConfirmation = {
  ageConfirmedAt: string;
  termsAcceptedAt: string;
  termsVersion: string;
};

export const isLegalConfirmationComplete = (
  confirmation: Partial<LegalConfirmation> | null | undefined
) =>
  confirmation?.termsVersion === dailyTermsVersion &&
  typeof confirmation.ageConfirmedAt === 'string' &&
  typeof confirmation.termsAcceptedAt === 'string';

export const safeLegalReturnPath = (value: string | null | undefined) => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  return value;
};
