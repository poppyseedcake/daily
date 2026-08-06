import { describe, expect, test, vi } from 'vitest';
import { createGoogleRoutesProvider } from './googleRoutesProvider';

describe('Google Routes provider', () => {
  test('requests both lossless traffic durations without retaining the raw response', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        routes: [{
          duration: '1440.5s',
          staticDuration: '1200.25s',
          privatePayload: 'do not retain'
        }]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    const provider = createGoogleRoutesProvider({ apiKey: 'test-key', fetcher });
    const estimate = await provider.estimateCommute({
      origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
      destination: { label: 'Office', latitude: 52.2, longitude: 21.2 }
    });

    expect(estimate).toEqual({
      durationMinutes: 24.008333333333333,
      staticDurationMinutes: 20.004166666666666
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'test-key',
          'x-goog-fieldmask': 'routes.duration,routes.staticDuration'
        }),
        body: expect.stringContaining('TRAFFIC_AWARE')
      })
    );
    const requestBody = JSON.parse(vi.mocked(fetcher).mock.calls[0]?.[1]?.body as string);
    expect(requestBody).toEqual({
      origin: { location: { latLng: { latitude: 52.1, longitude: 21.1 } } },
      destination: { location: { latLng: { latitude: 52.2, longitude: 21.2 } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE'
    });
    expect(JSON.stringify(requestBody)).not.toContain('Home');
    expect(JSON.stringify(requestBody)).not.toContain('Office');
    expect(JSON.stringify(estimate)).not.toContain('privatePayload');
  });

  test('rejects a missing or malformed duration pair', async () => {
    const provider = createGoogleRoutesProvider({
      apiKey: 'test-key',
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        routes: [{ duration: '1440s', staticDuration: '-1s' }]
      }), { status: 200 }))
    });

    await expect(provider.estimateCommute({
      origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
      destination: { label: 'Office', latitude: 52.2, longitude: 21.2 }
    })).rejects.toThrow();
  });

  test('returns no estimate when Google computes no route', async () => {
    const provider = createGoogleRoutesProvider({
      apiKey: 'test-key',
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [] }), { status: 200 }))
    });

    await expect(provider.estimateCommute({
      origin: { label: 'Home', latitude: 52.1, longitude: 21.1 },
      destination: { label: 'Unreachable', latitude: 52.2, longitude: 21.2 }
    })).resolves.toBeNull();
  });
});
