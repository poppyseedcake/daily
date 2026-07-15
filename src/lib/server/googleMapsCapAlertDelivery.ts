import { env } from '$env/dynamic/private';
import type { GoogleMapsCapAlert, GoogleMapsCapAlertDelivery } from './db/googleMapsUsageGate';
import {
  dailySummaryDeliveryProvider,
  dailySummarySenderAddress,
  type DailySummaryDeliveryProvider
} from './dailySummaryDelivery';

type GoogleMapsCapAlertEmailDeliveryOptions = {
  deliveryProvider: DailySummaryDeliveryProvider;
  operatorRecipient: () => string;
  senderAddress: () => string;
};

const categoryLines = (alert: GoogleMapsCapAlert) => [
  `Map point selection: ${alert.daily.byCategory['map-point-selection']} daily · ${alert.monthly.byCategory['map-point-selection']} monthly`,
  `Commute estimates: ${alert.daily.byCategory['commute-estimate']} daily · ${alert.monthly.byCategory['commute-estimate']} monthly`
];

const textContent = (alert: GoogleMapsCapAlert) =>
  [
    'Google Maps access is suspended.',
    `Cap type: ${alert.capType}`,
    `Suspension reason: ${alert.suspensionReason}`,
    `Accounting time basis: ${alert.timeBasis}`,
    `Daily period: ${alert.daily.periodStart} · ${alert.daily.total} / ${alert.daily.cap}`,
    `Monthly period: ${alert.monthly.periodStart} · ${alert.monthly.total} / ${alert.monthly.cap}`,
    ...categoryLines(alert)
  ].join('\n');

const htmlContent = (alert: GoogleMapsCapAlert) => `
  <h1>Google Maps access is suspended</h1>
  <dl>
    <dt>Cap type</dt><dd>${alert.capType}</dd>
    <dt>Suspension reason</dt><dd>${alert.suspensionReason}</dd>
    <dt>Accounting time basis</dt><dd>${alert.timeBasis}</dd>
    <dt>Daily period</dt><dd>${alert.daily.periodStart} · ${alert.daily.total} / ${alert.daily.cap}</dd>
    <dt>Monthly period</dt><dd>${alert.monthly.periodStart} · ${alert.monthly.total} / ${alert.monthly.cap}</dd>
    <dt>Map point selection</dt><dd>${alert.daily.byCategory['map-point-selection']} daily · ${alert.monthly.byCategory['map-point-selection']} monthly</dd>
    <dt>Commute estimates</dt><dd>${alert.daily.byCategory['commute-estimate']} daily · ${alert.monthly.byCategory['commute-estimate']} monthly</dd>
  </dl>
`.trim();

export const createGoogleMapsCapAlertEmailDelivery = ({
  deliveryProvider,
  operatorRecipient,
  senderAddress
}: GoogleMapsCapAlertEmailDeliveryOptions): GoogleMapsCapAlertDelivery => ({
  async send(alert, { idempotencyKey }) {
    const recipient = operatorRecipient().trim();
    if (!recipient) {
      throw new Error('Google Maps operator alert recipient is not configured');
    }

    await deliveryProvider.send({
      to: recipient,
      from: senderAddress(),
      subject: `[Daily] Google Maps ${alert.capType} cap reached`,
      html: htmlContent(alert),
      text: textContent(alert),
      idempotencyKey
    });
  }
});

export const googleMapsCapAlertDelivery = createGoogleMapsCapAlertEmailDelivery({
  deliveryProvider: dailySummaryDeliveryProvider,
  operatorRecipient: () => env.GOOGLE_MAPS_OPERATOR_ALERT_EMAIL ?? '',
  senderAddress: dailySummarySenderAddress
});
