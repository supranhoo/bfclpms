import { describe, it, expect } from 'vitest';
import { parseBandsBlock, splitBilingual, slugKey } from './bfclFormsWorkbook';

describe('splitBilingual', () => {
  it('splits on " / "', () => {
    expect(splitBilingual('Attendance / उपस्थिति')).toEqual({ en: 'Attendance', hi: 'उपस्थिति' });
  });
  it('returns null hi when no separator', () => {
    expect(splitBilingual('Attendance')).toEqual({ en: 'Attendance', hi: null });
  });
});

describe('parseBandsBlock', () => {
  it('parses the BFCL "5 - EN / HI\\n4 - EN / HI" format', () => {
    const raw = '5 - Always on time / हमेशा समय पर\n4 - Rarely late / शायद ही देर से\n0 - Unacceptable / अस्वीकार्य';
    const bands = parseBandsBlock(raw);
    expect(bands).toHaveLength(3);
    expect(bands[0]).toEqual({ score: 5, label_en: 'Always on time', label_hi: 'हमेशा समय पर' });
    expect(bands[2].score).toBe(0);
    // sorted high→low
    expect(bands.map((b) => b.score)).toEqual([5, 4, 0]);
  });
  it('returns [] for empty', () => {
    expect(parseBandsBlock('')).toEqual([]);
  });
});

describe('slugKey', () => {
  it('slugifies and clips', () => {
    expect(slugKey('Attendance & Punctuality')).toBe('attendance_punctuality');
  });
});