const minimumSecretBytes = 32;
const templateValues = new Set(['replace-me', 'replace-with-a-long-random-secret']);
const requiredSecrets = ['BETTER_AUTH_SECRET', 'GOOGLE_MAPS_ATTRIBUTION_SECRET'];
const requiredValues = ['DATABASE_URL'];

const unsafeSecrets = requiredSecrets.filter((name) => {
  const value = process.env[name]?.trim() ?? '';
  return Buffer.byteLength(value) < minimumSecretBytes || templateValues.has(value);
});

if (unsafeSecrets.length > 0) {
  console.error(
    `Production secrets must be independently configured with at least ${minimumSecretBytes} bytes: ${unsafeSecrets.join(', ')}`
  );
  process.exitCode = 1;
}

const missingValues = requiredValues.filter((name) => !(process.env[name]?.trim() ?? ''));

if (missingValues.length > 0) {
  console.error(`Production configuration is required for: ${missingValues.join(', ')}`);
  process.exitCode = 1;
}
