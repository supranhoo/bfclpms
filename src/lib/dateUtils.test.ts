import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatTime } from './dateUtils';

describe('formatDate', () => {
  it('formats string input correctly', () => {
    expect(formatDate('2025-12-12')).toBe('12 Dec 2025');
  });

  it('formats Date object correctly', () => {
    expect(formatDate(new Date(2025, 11, 12))).toBe('12 Dec 2025');
  });
});

describe('formatDateTime', () => {
  it('formats with AM/PM', () => {
    const result = formatDateTime(new Date(2025, 11, 12, 10, 30));
    expect(result).toBe('12 Dec 2025, 10:30 AM');
  });

  it('formats PM time correctly', () => {
    const result = formatDateTime(new Date(2025, 11, 12, 14, 15));
    expect(result).toBe('12 Dec 2025, 02:15 PM');
  });
});

describe('formatTime', () => {
  it('formats time only', () => {
    expect(formatTime(new Date(2025, 0, 1, 9, 5))).toBe('09:05 AM');
  });
});
