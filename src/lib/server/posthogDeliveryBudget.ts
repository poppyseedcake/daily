// Delivery may wait briefly for telemetry, but must finish even if an exporter hangs.
const telemetryFlushBudgetMilliseconds = 250;
export const telemetryRequestTimeoutMilliseconds = 1_000;

export const flushTelemetryWithinBudget = async (flush: () => Promise<unknown>) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(flush),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, telemetryFlushBudgetMilliseconds);
      })
    ]);
  } catch {
    // Telemetry is best effort; rejected exports must not fail delivery.
  } finally {
    clearTimeout(timer);
  }
};
