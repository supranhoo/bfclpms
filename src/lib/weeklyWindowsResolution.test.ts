import { describe, it, expect } from 'vitest';
import {
  getWeeklySubPeriods,
  canSubmitForSubPeriod,
  WEEKLY_REVIEW_WINDOWS,
  WeeklyReviewWindow,
} from './frequencyUtils';

/**
 * POLICY §Weekly Review Windows — Jyoti RCA (May 2026).
 *
 * Before the widened defaults, days 11–14, 19–21, 25–28 of every month were
 * dead zones where no week was open. This guards against regression.
 */
describe('Weekly review windows — no dead zones with default widened windows', () => {
  it('default constants leave no gap between consecutive weeks (days 8 → 31)', () => {
    for (let day = 8; day <= 31; day++) {
      const enabled = ([1, 2, 3, 4] as const).some((w) => {
        const win = WEEKLY_REVIEW_WINDOWS[`week_${w}`];
        return day >= win.start && day <= win.end;
      });
      expect(enabled, `day ${day} should have some week open`).toBe(true);
    }
  });

  it('Jyoti scenario — May 19, 2026 has Week 2 open and Week 3 closed', () => {
    const date = new Date(2026, 4, 19); // May 19
    const options = getWeeklySubPeriods(date, 'May', 2026);
    const w2 = options.find((o) => o.value === '2');
    const w3 = options.find((o) => o.value === '3');
    expect(w2?.isEnabled).toBe(true);
    expect(w3?.isEnabled).toBe(false);
  });

  it('May 22 — Week 2 closed, Week 3 open', () => {
    const date = new Date(2026, 4, 22);
    const options = getWeeklySubPeriods(date, 'May', 2026);
    expect(options.find((o) => o.value === '2')?.isEnabled).toBe(false);
    expect(options.find((o) => o.value === '3')?.isEnabled).toBe(true);
  });

  it('canSubmitForSubPeriod agrees with picker for May 19 / Week 2', () => {
    const date = new Date(2026, 4, 19);
    expect(canSubmitForSubPeriod('Weekly', '2', date, 'May', 2026)).toBe(true);
    expect(canSubmitForSubPeriod('Weekly', '3', date, 'May', 2026)).toBe(false);
  });

  it('Week 5 spans next month days 5–14', () => {
    // May has 31 days → Week 5 exists, reviewed in June
    const inWindow = new Date(2026, 5, 10); // June 10
    expect(canSubmitForSubPeriod('Weekly', '5', inWindow, 'May', 2026)).toBe(true);
    const tooEarly = new Date(2026, 5, 3); // June 3
    expect(canSubmitForSubPeriod('Weekly', '5', tooEarly, 'May', 2026)).toBe(false);
  });
});

describe('Weekly review windows — admin override is honored', () => {
  const customWindows: Record<string, WeeklyReviewWindow> = {
    week_1: { start: 1, end: 7 },
    week_2: { start: 8, end: 14 },
    week_3: { start: 15, end: 21 },
    week_4: { start: 22, end: 31 },
    week_5: { start: 1, end: 7, nextMonth: true },
  };

  it('getWeeklySubPeriods uses override to enable Week 2 on May 10', () => {
    const date = new Date(2026, 4, 10);
    const options = getWeeklySubPeriods(date, 'May', 2026, customWindows);
    expect(options.find((o) => o.value === '2')?.isEnabled).toBe(true);
    // Default windows would have left day 10 in a dead zone for week 2.
  });

  it('canSubmitForSubPeriod uses override', () => {
    const date = new Date(2026, 4, 3); // May 3
    // Override allows week_1 on day 3; defaults do not (start=8).
    expect(canSubmitForSubPeriod('Weekly', '1', date, 'May', 2026, customWindows)).toBe(true);
    expect(canSubmitForSubPeriod('Weekly', '1', date, 'May', 2026)).toBe(false);
  });

  it('empty/null override falls back to defaults', () => {
    const date = new Date(2026, 4, 19);
    expect(canSubmitForSubPeriod('Weekly', '2', date, 'May', 2026, null)).toBe(true);
    expect(canSubmitForSubPeriod('Weekly', '2', date, 'May', 2026, {})).toBe(true);
  });
});
