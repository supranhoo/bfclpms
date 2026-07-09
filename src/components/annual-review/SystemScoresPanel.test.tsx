import { describe, it, expect } from 'vitest';
import { formatAchievement } from './SystemScoresPanel';

describe('formatAchievement', () => {
  it('formats percent integers as N%', () => {
    expect(formatAchievement(90, 'percent')).toBe('90%');
  });
  it('coerces fractional percent (0.9) to 90%', () => {
    expect(formatAchievement(0.9, 'percent')).toBe('90%');
  });
  it('renders binary as Yes/No', () => {
    expect(formatAchievement(1, 'binary')).toBe('Yes');
    expect(formatAchievement(0, 'binary')).toBe('No');
  });
  it('appends days unit', () => {
    expect(formatAchievement(48, 'days')).toBe('48 days');
    expect(formatAchievement(1, 'days')).toBe('1 day');
  });
  it('falls back to raw number for count/rating/unknown', () => {
    expect(formatAchievement(12, 'count')).toBe('12');
    expect(formatAchievement(3, 'rating')).toBe('3');
    expect(formatAchievement(7, undefined)).toBe('7');
  });
  it('returns em dash for null/empty', () => {
    expect(formatAchievement(null, 'percent')).toBe('—');
    expect(formatAchievement(undefined, 'binary')).toBe('—');
    expect(formatAchievement('', 'days')).toBe('—');
  });
});