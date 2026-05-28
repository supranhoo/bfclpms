import { describe, it, expect } from 'vitest';
import {
  isWithinEditWindow,
  remainingEditMinutes,
  formatRemainingEditWindow,
  OBSERVATION_EDIT_WINDOW_HOURS,
} from '@/lib/editWindow';

const HOUR = 60 * 60 * 1000;
const now = Date.parse('2026-05-28T10:00:00Z');

describe('editWindow', () => {
  it('returns true within the window', () => {
    const created = new Date(now - 2 * HOUR).toISOString();
    expect(isWithinEditWindow(created, now)).toBe(true);
  });

  it('returns false at exactly the boundary (24h)', () => {
    const created = new Date(now - OBSERVATION_EDIT_WINDOW_HOURS * HOUR).toISOString();
    expect(isWithinEditWindow(created, now)).toBe(false);
  });

  it('returns false past the window', () => {
    const created = new Date(now - 25 * HOUR).toISOString();
    expect(isWithinEditWindow(created, now)).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isWithinEditWindow(null, now)).toBe(false);
    expect(isWithinEditWindow(undefined, now)).toBe(false);
    expect(isWithinEditWindow('not-a-date', now)).toBe(false);
  });

  it('remainingEditMinutes counts down', () => {
    const created = new Date(now - 23 * HOUR).toISOString();
    expect(remainingEditMinutes(created, now)).toBe(60);
  });

  it('remainingEditMinutes is 0 after expiry', () => {
    expect(remainingEditMinutes(new Date(now - 25 * HOUR).toISOString(), now)).toBe(0);
  });

  it('formats remaining as h/m', () => {
    const created = new Date(now - 1 * HOUR).toISOString();
    expect(formatRemainingEditWindow(created, now)).toBe('23h 0m left');
    expect(formatRemainingEditWindow(new Date(now - 25 * HOUR).toISOString(), now)).toBe('expired');
  });
});