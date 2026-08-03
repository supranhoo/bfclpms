import { describe, expect, it } from 'vitest';
import {
  changesBand,
  classifyDrift,
  driftDelta,
  summariseDrift,
  type FinalScoreDriftRow,
} from '@/lib/annualReview/finalScoreDrift';

const row = (o: Partial<FinalScoreDriftRow>): FinalScoreDriftRow => ({
  instance_id: 'i1',
  employee_code: '102011',
  employee_name: 'Sumit Kumar',
  stored_total: 53,
  computed_total: 70,
  stored_rating: 'Poor',
  computed_rating: 'Good',
  ...o,
});

describe('ADR-235 final score drift', () => {
  it('flags the real-world understated case (102011: 53.00 -> 70.00)', () => {
    const r = row({});
    expect(classifyDrift(r)).toBe('understated');
    expect(driftDelta(r)).toBe(17);
    expect(changesBand(r)).toBe(true);
  });

  it('flags an overstated stored score', () => {
    expect(classifyDrift(row({ stored_total: 84.8, computed_total: 49.8 }))).toBe('overstated');
  });

  it('flags a band-only mismatch when the score matches', () => {
    expect(
      classifyDrift(row({ stored_total: 70, computed_total: 70, stored_rating: 'Average' })),
    ).toBe('band_only');
  });

  it('treats sub-cent differences and equal bands as clean', () => {
    expect(
      classifyDrift(
        row({ stored_total: 70.001, computed_total: 70, stored_rating: 'Good' }),
      ),
    ).toBe('none');
  });

  it('handles a null stored score as understated', () => {
    expect(classifyDrift(row({ stored_total: null, computed_total: 12 }))).toBe('understated');
  });

  it('summarises a batch', () => {
    const s = summariseDrift([
      row({}),
      row({ instance_id: 'i2', stored_total: 62.6, computed_total: 64.6, stored_rating: 'Average', computed_rating: 'Average' }),
      row({ instance_id: 'i3', stored_total: 70, computed_total: 70, stored_rating: 'Good', computed_rating: 'Good' }),
    ]);
    expect(s).toMatchObject({ total: 2, understated: 2, overstated: 0, bandOnly: 0, bandChanges: 1, maxDelta: 17 });
  });
});
