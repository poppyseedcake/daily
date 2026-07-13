import { describe, expect, it } from 'vitest';
import { selectLocalPoint } from './localPointSelection';

describe('selectLocalPoint', () => {
  it('returns a known readable label without using an external Maps request', () => {
    expect(selectLocalPoint({ latitude: 52.2285, longitude: 21.0037 })).toEqual({
      label: 'Warsaw Central Station, Warsaw, Poland',
      latitude: 52.2285,
      longitude: 21.0037
    });
  });

  it('creates readable local metadata for any valid coordinate pair', () => {
    expect(selectLocalPoint({ latitude: 50, longitude: 19 })).toEqual({
      label: 'Selected map point near 50.0000, 19.0000',
      latitude: 50,
      longitude: 19
    });
  });
});
