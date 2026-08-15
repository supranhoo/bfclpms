import { describe, expect, it } from 'vitest';
import { lookalikeCounts, normalizeConsoleTitle } from './lookalikeTitles';

describe('normalizeConsoleTitle', () => {
  it('strips scoring ladders, incentive notes and month brackets', () => {
    expect(
      normalizeConsoleTitle(
        'Power generation from 45 MWh/AFBC (incentive %)(Aug-Sep,Oct-Nov) 20% incentive = 5, 15% = 4',
      ),
    ).toBe('power generation from 45 mwh/afbc');
  });

  it('leaves a clean title equal to its normalised form', () => {
    expect(normalizeConsoleTitle('Power generation from 45 MWh/AFBC')).toBe(
      'power generation from 45 mwh/afbc',
    );
  });

  it('returns empty for blank input', () => {
    expect(normalizeConsoleTitle(null)).toBe('');
    expect(normalizeConsoleTitle('   ')).toBe('');
  });
});

describe('lookalikeCounts', () => {
  it('flags both rows of a mis-split pair and leaves unrelated rows alone', () => {
    const counts = lookalikeCounts([
      { key: 'a', title: 'Power generation from 45 MWh/AFBC' },
      { key: 'b', title: 'Power generation from 45 MWh/AFBC (incentive %)(Aug-Sep)' },
      { key: 'c', title: 'Steam consumption' },
    ]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(2);
    expect(counts.has('c')).toBe(false);
  });

  it('never groups rows without a title', () => {
    const counts = lookalikeCounts([
      { key: 'a', title: '' },
      { key: 'b', title: null },
    ]);
    expect(counts.size).toBe(0);
  });
});
