export const defaultOperationalRetentionDays = 30;

export const positiveBoundedInteger = (value: number, name: string, maximum?: number) => {
  if (!Number.isSafeInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    throw new Error(`${name} must be a positive bounded integer.`);
  }

  return value;
};

export const operationalRetentionDaysFromEnvironment = (
  configuredValue =
    process.env.OPERATIONAL_RETENTION_DAYS ?? process.env.TECHNICAL_LOG_RETENTION_DAYS
) => {
  if (configuredValue === undefined || configuredValue === '') {
    return defaultOperationalRetentionDays;
  }

  return positiveBoundedInteger(Number(configuredValue), 'OPERATIONAL_RETENTION_DAYS');
};

export const operationalRetentionCutoff = (now: Date, retentionDays: number) => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff.toISOString();
};
