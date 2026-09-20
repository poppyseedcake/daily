const minimumSecretBytes = 32;
const templateValues = new Set([
  'replace-me',
  'replace-with-a-long-random-secret',
  '<set-in-coolify>',
  'your-value-here'
]);
const contexts = new Set(['web', 'worker', 'migrate', 'backup', 'restore']);

const contextArgument = process.argv[2] ?? '--context=web';
const context = contextArgument.startsWith('--context=')
  ? contextArgument.slice('--context='.length)
  : process.argv[2] === '--context'
    ? process.argv[3]
    : null;

const invalidArguments =
  (contextArgument === '--context' ? process.argv.slice(4) : process.argv.slice(3)).length > 0;
const errors = [];

if (!context || !contexts.has(context) || invalidArguments) {
  errors.push('PRODUCTION_VALIDATION_CONTEXT');
}

const valueFor = (name) => process.env[name]?.trim() ?? '';
const isTemplateValue = (value) => templateValues.has(value.toLowerCase());

const requireValues = (names) => {
  for (const name of names) {
    const value = valueFor(name);
    if (!value || isTemplateValue(value)) errors.push(name);
  }
};

const requireSecrets = (names) => {
  for (const name of names) {
    const value = valueFor(name);
    if (Buffer.byteLength(value) < minimumSecretBytes || isTemplateValue(value)) errors.push(name);
  }
};

const requireUrl = (name) => {
  const value = valueFor(name);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
      errors.push(name);
    }
  } catch {
    errors.push(name);
  }
};

const requirePositiveInteger = (name) => {
  const value = valueFor(name);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    errors.push(name);
  }
};

const requireIntegerBetween = (name, minimum, maximum) => {
  const value = valueFor(name);
  const number = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < minimum ||
    number > maximum
  ) {
    errors.push(name);
  }
};

const requireBoolean = (name) => {
  if (!['true', 'false'].includes(valueFor(name).toLowerCase())) errors.push(name);
};

if (context === 'web') {
  requireValues([
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_ROUTES_GLOBAL_DAILY_CAP',
    'GOOGLE_ROUTES_GLOBAL_MONTHLY_CAP',
    'GOOGLE_ROUTES_PER_PERSON_DAILY_LIMIT',
    'GOOGLE_PLACES_GLOBAL_MONTHLY_CAP',
    'GOOGLE_PLACES_PER_PERSON_DAILY_LIMIT'
  ]);
  requireSecrets(['BETTER_AUTH_SECRET', 'GOOGLE_MAPS_ATTRIBUTION_SECRET']);
  requireUrl('ORIGIN');
  requireUrl('BETTER_AUTH_URL');
  if (valueFor('ORIGIN') !== valueFor('BETTER_AUTH_URL')) {
    errors.push('ORIGIN', 'BETTER_AUTH_URL');
  }
} else if (context === 'worker') {
  requireValues([
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL'
  ]);
  requireSecrets(['BETTER_AUTH_SECRET', 'GOOGLE_MAPS_ATTRIBUTION_SECRET']);
  requireBoolean('SCHEDULED_DELIVERY_ENABLED');
  if (valueFor('SCHEDULED_DELIVERY_ENABLED').toLowerCase() !== 'true') {
    errors.push('SCHEDULED_DELIVERY_ENABLED');
  }
} else if (context === 'migrate') {
  requireValues(['DATABASE_URL', 'MIGRATIONS_DIRECTORY']);
  if (valueFor('SCHEDULED_DELIVERY_ENABLED').toLowerCase() === 'true') {
    errors.push('SCHEDULED_DELIVERY_ENABLED');
  }
} else if (context === 'backup') {
  requireValues(['DATABASE_URL', 'BACKUP_DIRECTORY']);
  requirePositiveInteger('BACKUP_RETENTION_DAYS');
} else if (context === 'restore') {
  requireValues(['DATABASE_URL', 'MIGRATIONS_DIRECTORY']);
  if (valueFor('DAILY_RESTORE_OFFLINE').toLowerCase() !== 'true') {
    errors.push('DAILY_RESTORE_OFFLINE');
  }
  if (valueFor('SCHEDULED_DELIVERY_ENABLED').toLowerCase() === 'true') {
    errors.push('SCHEDULED_DELIVERY_ENABLED');
  }
}

for (const name of ['GOOGLE_MAPS_KILL_SWITCH', 'SCHEDULED_DELIVERY_ENABLED']) {
  if (valueFor(name)) requireBoolean(name);
}

for (const name of [
  'GOOGLE_ROUTES_GLOBAL_DAILY_CAP',
  'GOOGLE_ROUTES_GLOBAL_MONTHLY_CAP',
  'GOOGLE_ROUTES_PER_PERSON_DAILY_LIMIT',
  'GOOGLE_PLACES_GLOBAL_MONTHLY_CAP',
  'GOOGLE_PLACES_PER_PERSON_DAILY_LIMIT',
  'BACKUP_RETENTION_DAYS',
  'OPERATIONAL_RETENTION_DAYS'
]) {
  if (valueFor(name)) requirePositiveInteger(name);
}

if (valueFor('SCHEDULED_WORKER_OVERDUE_MINUTES')) {
  requireIntegerBetween('SCHEDULED_WORKER_OVERDUE_MINUTES', 2, 1440);
}

if (process.env.DAILY_SYSTEMD_BACKUP_UNIT === 'true') {
  if (process.env.DATABASE_URL !== '/var/lib/daily/daily.db') errors.push('DATABASE_URL');
  if (process.env.BACKUP_DIRECTORY !== '/var/backups/daily') {
    errors.push('BACKUP_DIRECTORY');
  }
}

const uniqueErrors = [...new Set(errors)];
if (uniqueErrors.length > 0) {
  console.error(
    `Production configuration is invalid for ${context ?? 'unknown'} context: ${uniqueErrors.join(', ')}`
  );
  process.exitCode = 1;
}
