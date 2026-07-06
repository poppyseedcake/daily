import { describe, expect, test } from 'vitest';
import { weatherLocationSchema } from './weatherLocation';

describe('Weather Location', () => {
  test('accepts a readable place label with resolved coordinates', () => {
    expect(
      weatherLocationSchema.parse({
        label: 'Springfield, Illinois, United States',
        latitude: 39.799,
        longitude: -89.644
      })
    ).toEqual({
      label: 'Springfield, Illinois, United States',
      latitude: 39.799,
      longitude: -89.644
    });
  });

  test('rejects empty, unsafe, and out-of-range Weather Location input', () => {
    expect(() =>
      weatherLocationSchema.parse({
        label: '   ',
        latitude: 39.799,
        longitude: -89.644
      })
    ).toThrow();
    expect(() =>
      weatherLocationSchema.parse({
        label: '<script>alert("x")</script>',
        latitude: 39.799,
        longitude: -89.644
      })
    ).toThrow();
    expect(() =>
      weatherLocationSchema.parse({
        label: 'Springfield, Illinois, United States',
        latitude: 91,
        longitude: -89.644
      })
    ).toThrow();
    expect(() =>
      weatherLocationSchema.parse({
        label: 'Springfield, Illinois, United States',
        latitude: 39.799,
        longitude: -181
      })
    ).toThrow();
  });
});
