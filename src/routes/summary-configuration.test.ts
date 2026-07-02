import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultSummaryConfiguration } from '$lib/summaryConfiguration';

const { getSession, savedConfigurations } = vi.hoisted(() => ({
  getSession: vi.fn(),
  savedConfigurations: [] as Array<{ userId: string; configuration: unknown }>
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession
    }
  }
}));

vi.mock('$lib/server/db/summaryConfigurationStore', () => ({
  userSummaryConfigurationStore: {
    async load() {
      return null;
    },
    async save(userId: string, configuration: unknown) {
      savedConfigurations.push({ userId, configuration });
    }
  }
}));

const { PUT } = await import('./summary-configuration/+server');

const putSummaryConfigurationBody = (body: BodyInit) =>
  PUT({
    request: new Request('http://localhost/summary-configuration', {
      method: 'PUT',
      body
    })
  } as Parameters<typeof PUT>[0]);

const putSummaryConfiguration = (body: unknown) => putSummaryConfigurationBody(JSON.stringify(body));

describe('Summary Configuration endpoint', () => {
  beforeEach(() => {
    getSession.mockReset();
    savedConfigurations.length = 0;
  });

  test('rejects Visitor updates before writing', async () => {
    getSession.mockResolvedValue(null);

    const response = await putSummaryConfiguration(defaultSummaryConfiguration);

    expect(response.status).toBe(401);
    expect(savedConfigurations).toEqual([]);
  });

  test('rejects invalid signed-in User updates before writing', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await putSummaryConfiguration({
      ...defaultSummaryConfiguration,
      summaryTime: '99:99'
    });

    expect(response.status).toBe(400);
    expect(savedConfigurations).toEqual([]);
  });

  test('rejects malformed JSON before writing', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await putSummaryConfigurationBody('{');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ outcome: 'invalid-configuration' });
    expect(savedConfigurations).toEqual([]);
  });

  test('saves valid updates for the signed-in User only', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', emailVerified: true }
    });

    const response = await putSummaryConfiguration({
      ...defaultSummaryConfiguration,
      summaryTime: '18:45'
    });

    expect(response.status).toBe(200);
    expect(savedConfigurations).toEqual([
      {
        userId: 'user-1',
        configuration: {
          ...defaultSummaryConfiguration,
          summaryTime: '18:45'
        }
      }
    ]);
  });
});
