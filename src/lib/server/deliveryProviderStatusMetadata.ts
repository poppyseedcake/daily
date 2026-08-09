const safeProviderStatusMetadataPatterns = [
  /^accepted(?: by provider)?(?:; missing message id)?$/,
  /^missing (?:message id|RESEND_API_KEY|RESEND_FROM_EMAIL)$/,
  /^status=[1-5][0-9]{2}$/,
  /^rate limited$/,
  /^temporarily unavailable$/
];

export const privacyPreservingProviderStatusMetadata = (metadata: string | null) => {
  if (!metadata) return null;

  return safeProviderStatusMetadataPatterns.some((pattern) => pattern.test(metadata))
    ? metadata
    : 'redacted';
};
