const messages = {
  required: 'Check both boxes to continue.',
  provider: 'Google sign-in could not start. Try again.'
} as const;

export const load = ({ url }) => ({
  error: messages[url.searchParams.get('error') as keyof typeof messages] ?? null
});
