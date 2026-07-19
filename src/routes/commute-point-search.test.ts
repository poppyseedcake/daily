import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getSession, requestGateway, searchAddresses, resolveAddress } = vi.hoisted(() => ({
  getSession: vi.fn(),
  requestGateway: vi.fn(),
  searchAddresses: vi.fn(),
  resolveAddress: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('$lib/server/googleMapsOperations', () => ({
  googleMapsOperations: { requestGateway }
}));

const { GET } = await import('./commute-point-search/+server');
const { POST } = await import('./commute-point-selection/+server');

describe('Commute address lookup endpoints', () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue(null);
    requestGateway.mockReset().mockReturnValue({ searchAddresses, resolveAddress });
    searchAddresses.mockReset();
    resolveAddress.mockReset();
  });

  test('returns Google address suggestions and attributes a Visitor from the request boundary', async () => {
    searchAddresses.mockResolvedValue({
      outcome: 'available',
      suggestions: [{ placeId: 'place-1', label: 'Marszałkowska 1, Warszawa' }]
    });
    const request = new Request('http://localhost/commute-point-search?q=Marsza%C5%82kowska%201&sessionToken=550e8400-e29b-41d4-a716-446655440000', {
      headers: { 'user-agent': 'test-browser' }
    });
    const response = await GET({ request, getClientAddress: () => '127.0.0.1' } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      outcome: 'available',
      suggestions: [{ placeId: 'place-1', label: 'Marszałkowska 1, Warszawa' }]
    });
    expect(searchAddresses).toHaveBeenCalledWith({
      query: 'Marszałkowska 1',
      sessionToken: '550e8400-e29b-41d4-a716-446655440000'
    });
    expect(requestGateway).toHaveBeenCalledWith(
      { mode: 'visitor' },
      { clientAddress: '127.0.0.1', userAgent: 'test-browser' }
    );
  });

  test('resolves only a selected Place prediction into a Commute point', async () => {
    resolveAddress.mockResolvedValue({
      outcome: 'available',
      point: { label: 'Marszałkowska 1, Warszawa', latitude: 52.2191, longitude: 21.0182 }
    });
    const request = new Request('http://localhost/commute-point-selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        placeId: 'place-1',
        sessionToken: '550e8400-e29b-41d4-a716-446655440000'
      })
    });
    const response = await POST({ request, getClientAddress: () => '127.0.0.1' } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    expect(resolveAddress).toHaveBeenCalledWith({
      placeId: 'place-1',
      sessionToken: '550e8400-e29b-41d4-a716-446655440000'
    });
  });

  test('rejects malformed search and selection input before using Google', async () => {
    const searchResponse = await GET({
      request: new Request('http://localhost/commute-point-search?q=a&sessionToken=bad token'),
      getClientAddress: () => '127.0.0.1'
    } as Parameters<typeof GET>[0]);
    const selectionResponse = await POST({
      request: new Request('http://localhost/commute-point-selection', {
        method: 'POST',
        body: JSON.stringify({ placeId: '', sessionToken: '<unsafe>' })
      }),
      getClientAddress: () => '127.0.0.1'
    } as Parameters<typeof POST>[0]);

    expect(searchResponse.status).toBe(400);
    expect(selectionResponse.status).toBe(400);
    expect(requestGateway).not.toHaveBeenCalled();
  });
});
