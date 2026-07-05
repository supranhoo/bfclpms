import { describe, it, expect } from 'vitest';
import {
  parseScoringBands, bandsToOptions, bandsToBilingualOptions,
  optionsToBands, defaultLadder,
} from './criteriaBands';

describe('parseScoringBands', () => {
  it('parses label_en/label_hi shape', () => {
    const r = parseScoringBands([
      { score: 5, label_en: 'Outstanding', label_hi: 'उत्कृष्ट' },
      { score: 3, label_en: 'OK' },
    ] as never);
    expect(r).toHaveLength(2);
    expect(r[0].score).toBe(5);
    expect(r[0].label_hi).toBe('उत्कृष्ट');
  });

  it('splits "EN / HI" combined label', () => {
    const r = parseScoringBands([{ score: 4, label: 'Good / अच्छा' }] as never);
    expect(r[0].label_en).toBe('Good');
    expect(r[0].label_hi).toBe('अच्छा');
  });

  it('returns [] for malformed input', () => {
    expect(parseScoringBands(null)).toEqual([]);
    expect(parseScoringBands('junk' as never)).toEqual([]);
  });
});

describe('bandsToOptions', () => {
  it('produces exactly maxScore+1 buttons even with sparse bands', () => {
    const opts = bandsToOptions(
      [{ score: 5, label_en: 'Top' }, { score: 0, label_en: 'None' }] as never,
      5,
    );
    expect(opts).toHaveLength(6);
    expect(opts.map((o) => o.score)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(opts[0].label).toBe('Top');
    expect(opts[5].label).toBe('None');
    // Interior scores fall back to default ladder text
    expect(opts[1].label).toBe('Above target');
  });

  it('drops bands outside the 0..max range', () => {
    const opts = bandsToOptions(
      [{ score: 8, label_en: 'Ignored' }, { score: 3, label_en: 'Kept' }] as never,
      5,
    );
    expect(opts.every((o) => o.score >= 0 && o.score <= 5)).toBe(true);
    expect(opts.find((o) => o.score === 3)?.label).toBe('Kept');
  });

  it('falls back to default ladder when bands are empty', () => {
    const opts = bandsToOptions(null, 5);
    expect(opts).toHaveLength(6);
    expect(opts[0].label).toBe('Outstanding');
  });
});

describe('bandsToBilingualOptions', () => {
  it('carries label_hi through to options', () => {
    const opts = bandsToBilingualOptions(
      [{ score: 5, label_en: 'Top', label_hi: 'शीर्ष' }] as never,
      5,
    );
    expect(opts[0].label_hi).toBe('शीर्ष');
  });
});

describe('optionsToBands / defaultLadder round-trip', () => {
  it('round-trips through parse', () => {
    const ladder = defaultLadder(5);
    const json = optionsToBands(ladder);
    const parsed = parseScoringBands(json);
    expect(parsed).toHaveLength(6);
    expect(parsed[0].score).toBe(5);
  });
});