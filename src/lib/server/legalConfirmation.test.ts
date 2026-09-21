import { describe, expect, test } from 'vitest';
import {
  issueLegalConfirmationCookie,
  parseLegalConfirmationCookie,
  serializeLegalConfirmationCookie
} from './legalConfirmation';

describe('legal confirmation cookie', () => {
  const now = new Date('2026-09-21T10:00:00.000Z');

  test('round-trips only the current signed confirmation', () => {
    const value = issueLegalConfirmationCookie(now);
    const headers = new Headers({
      cookie: serializeLegalConfirmationCookie(value, false).split(';')[0]
    });

    expect(parseLegalConfirmationCookie(headers, now)).toEqual({
      ageConfirmedAt: now.toISOString(),
      termsAcceptedAt: now.toISOString(),
      termsVersion: '2026-09-21'
    });
  });

  test('rejects a changed or expired confirmation', () => {
    const value = issueLegalConfirmationCookie(now);
    const changedValue = `${value.slice(0, -1)}${value.endsWith('a') ? 'b' : 'a'}`;
    const changedHeaders = new Headers({
      cookie: `daily.legal_confirmation=${changedValue}`
    });
    const expiredHeaders = new Headers({
      cookie: `daily.legal_confirmation=${value}`
    });

    expect(parseLegalConfirmationCookie(changedHeaders, now)).toBeNull();
    expect(
      parseLegalConfirmationCookie(expiredHeaders, new Date('2026-09-21T10:16:00.000Z'))
    ).toBeNull();
  });
});
