/**
 * Frequency and Sub-Frequency Logic for PMS
 * 
 * Supports 7 frequency types:
 * - Daily: Rolling 2-day window (today + yesterday)
 * - Weekly: 5 weeks per month with specific review windows
 * - Monthly: Standard monthly submission
 * - Bi-Monthly: 2-month cycles (review in 2nd month)
 * - Quarterly: 3-month cycles (review in 3rd month)
 * - Half-Yearly: 6-month cycles (review in 6th month)
 * - Yearly: 12-month cycles (review in 12th month)
 */

import { format, subDays, getDaysInMonth, getDay, startOfMonth, addDays, isSameDay, isAfter, isBefore } from 'date-fns';
import type { FrequencyConfig } from '@/hooks/useFrequencyConfig';
import { resolveEffectiveCycleOption } from '@/lib/frequencyCycleOptions';
import type { CycleOption } from '@/lib/frequencyCycleOptions';
import { BI_MONTHLY_OPTIONS, QUARTERLY_OPTIONS, HALF_YEARLY_OPTIONS, YEARLY_OPTIONS } from '@/lib/frequencyCycleOptions';

export type FrequencyType = 'Daily' | 'Weekly' | 'Monthly' | 'Bi-Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';

/**
 * Normalize frequency strings to their canonical form.
 * Handles common variants like 'Bimonthly' → 'Bi-Monthly', 'quarterly' → 'Quarterly'.
 */
export function normalizeFrequency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[-\s]/g, '');
  const map: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    bimonthly: 'Bi-Monthly',
    quarterly: 'Quarterly',
    halfyearly: 'Half-Yearly',
    yearly: 'Yearly',
  };
  return map[key] ?? raw;
}

export type YearlyCycleType = 'Jan-Dec' | 'Jul-Jun' | 'Apr-Mar' | 'Custom';

export interface SubPeriodOption {
  value: string;
  label: string;
  isEnabled: boolean;
  isSubmitted?: boolean;
}

export interface WeeklyReviewWindow {
  start: number;
  end: number;
  nextMonth?: boolean;
}

export const FREQUENCY_OPTIONS: FrequencyType[] = [
  'Daily',
  'Weekly', 
  'Monthly',
  'Bi-Monthly',
  'Quarterly',
  'Half-Yearly',
  'Yearly'
];

export const YEARLY_CYCLE_OPTIONS: YearlyCycleType[] = [
  'Jan-Dec',
  'Jul-Jun',
  'Apr-Mar',
  'Custom'
];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const;

export const WEEKLY_REVIEW_WINDOWS: Record<string, WeeklyReviewWindow> = {
  'week_1': { start: 8, end: 10 },
  'week_2': { start: 15, end: 18 },
  'week_3': { start: 22, end: 24 },
  'week_4': { start: 29, end: 31 },
  'week_5': { start: 5, end: 8, nextMonth: true },
};

/**
 * Get the month number (1-12) from month name
 */
export function getMonthNumber(monthName: string): number {
  const index = MONTHS.indexOf(monthName as typeof MONTHS[number]);
  return index >= 0 ? index + 1 : 1;
}

/**
 * Get month name from month number (1-12)
 */
export function getMonthName(monthNumber: number): string {
  return MONTHS[monthNumber - 1] || 'January';
}

/**
 * Get sub-frequency label based on frequency type
 */
export function getSubFrequency(frequency: FrequencyType): string {
  switch (frequency) {
    case 'Daily':
      return 'Daily';
    case 'Weekly':
      return 'Weekly';
    case 'Monthly':
      return 'Monthly';
    case 'Bi-Monthly':
      return 'Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec';
    case 'Quarterly':
      return 'Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec';
    case 'Half-Yearly':
      return 'Jan-Jun, Jul-Dec';
    case 'Yearly':
      return 'Jan-Dec';
    default:
      return 'Monthly';
  }
}

/**
 * Get available sub-periods for Daily frequency.
 * Returns all dates in the review month; dates within the submission window are enabled.
 * @param windowDays Number of past days (from today) that are open for submission (default 2 = today + yesterday)
 */
export function getDailySubPeriods(currentDate: Date, reviewMonth: string, reviewYear: number, windowDays: number = 2): SubPeriodOption[] {
  const today = currentDate;
  const monthIndex = getMonthNumber(reviewMonth) - 1;
  const daysInMonth = getDaysInMonth(new Date(reviewYear, monthIndex));
  
  // Calculate the earliest date that falls within the submission window
  const windowStart = subDays(today, windowDays - 1); // windowDays=2 means today + yesterday
  
  const options: SubPeriodOption[] = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(reviewYear, monthIndex, day);
    
    // Don't show future dates
    if (isAfter(date, today)) break;
    
    const isWithinWindow = !isBefore(date, windowStart);
    const isToday = isSameDay(date, today);
    
    let label = format(date, 'd MMM');
    if (isToday) label += ' (Today)';
    
    options.push({
      value: format(date, 'yyyy-MM-dd'),
      label,
      isEnabled: isWithinWindow,
    });
  }
  
  // Show most recent dates first for convenience
  return options.reverse();
}

/**
 * Get available sub-periods for Weekly frequency
 * Returns week numbers with their review window status
 */
export function getWeeklySubPeriods(currentDate: Date, reviewMonth: string, reviewYear: number): SubPeriodOption[] {
  const dayOfMonth = currentDate.getDate();
  const currentMonth = format(currentDate, 'MMMM');
  const currentYear = currentDate.getFullYear();
  
  const options: SubPeriodOption[] = [];
  
  // Week 1-4 for the review month
  for (let week = 1; week <= 4; week++) {
    const windowKey = `week_${week}` as keyof typeof WEEKLY_REVIEW_WINDOWS;
    const window = WEEKLY_REVIEW_WINDOWS[windowKey];
    
    // Check if we're in the review window for this week
    const isInWindow = 
      currentMonth === reviewMonth && 
      currentYear === reviewYear &&
      dayOfMonth >= window.start && 
      dayOfMonth <= window.end;
    
    options.push({
      value: week.toString(),
      label: `Week ${week} (${getWeekDateRange(week, reviewMonth, reviewYear)})`,
      isEnabled: isInWindow,
    });
  }
  
  // Week 5 (if applicable) - reviewed in next month
  const daysInMonth = getDaysInMonth(new Date(reviewYear, getMonthNumber(reviewMonth) - 1));
  if (daysInMonth > 28) {
    const week5Window = WEEKLY_REVIEW_WINDOWS['week_5'];
    const nextMonth = getMonthNumber(reviewMonth) === 12 ? 'January' : getMonthName(getMonthNumber(reviewMonth) + 1);
    const nextYear = getMonthNumber(reviewMonth) === 12 ? reviewYear + 1 : reviewYear;
    
    const isInWindow = 
      currentMonth === nextMonth && 
      currentYear === nextYear &&
      dayOfMonth >= week5Window.start && 
      dayOfMonth <= week5Window.end;
    
    options.push({
      value: '5',
      label: `Week 5 (${daysInMonth - 27}-${daysInMonth} ${reviewMonth.slice(0, 3)})`,
      isEnabled: isInWindow,
    });
  }
  
  return options;
}

/**
 * Get date range string for a week number
 */
function getWeekDateRange(week: number, month: string, year: number): string {
  const startDay = (week - 1) * 7 + 1;
  const endDay = Math.min(week * 7, getDaysInMonth(new Date(year, getMonthNumber(month) - 1)));
  return `${startDay}-${endDay} ${month.slice(0, 3)}`;
}

/**
 * Check if a month is in any of the locked month arrays from frequency_config
 */
function isMonthLockedByConfig(monthNum: number, lockedMonths: Record<string, number[]> | null): boolean {
  if (!lockedMonths) return false;
  return Object.values(lockedMonths).some((months) => months.includes(monthNum));
}

/**
 * Check if a KPI is locked based on its frequency and the current review period.
 * When a FrequencyConfig is provided, uses database-driven locked_months instead of hardcoded values.
 */
export function isKpiLockedForPeriod(
  rawFrequency: FrequencyType | string | null,
  reviewMonth: string,
  reviewYear: number,
  frequencyCycleStart?: string | null,
  config?: FrequencyConfig | null
): boolean {
  const frequency = normalizeFrequency(rawFrequency);
  if (!frequency) return false;
  
  const monthNum = getMonthNumber(reviewMonth);

  // Resolve effective cycle option: per-KPI override → global config → hardcoded default
  const effectiveCycle = resolveEffectiveCycleOption(frequency, frequencyCycleStart, config?.sub_frequency);
  if (effectiveCycle) {
    return isMonthLockedByConfig(monthNum, effectiveCycle.lockedMonths);
  }

  // If we have a database config with locked_months, use it
  if (config?.locked_months) {
    return isMonthLockedByConfig(monthNum, config.locked_months as Record<string, number[]>);
  }
  
  switch (frequency) {
    case 'Daily':
    case 'Weekly':
    case 'Monthly':
      return false;
      
    case 'Bi-Monthly':
      return monthNum % 2 === 1;
      
    case 'Quarterly':
      return monthNum % 3 !== 0;
      
    case 'Half-Yearly':
      return monthNum !== 6 && monthNum !== 12;
      
    case 'Yearly':
      const cycleStart = frequencyCycleStart || 'Jan-Dec';
      return isYearlyLocked(monthNum, cycleStart);
      
    default:
      return false;
  }
}

/**
 * Check if locked for yearly frequency based on cycle start
 */
function isYearlyLocked(monthNum: number, cycleStart: string): boolean {
  switch (cycleStart) {
    case 'Jan-Dec':
      return monthNum !== 12; // Only December is active
    case 'Jul-Jun':
      return monthNum !== 6; // Only June is active
    case 'Apr-Mar':
      return monthNum !== 3; // Only March is active
    default:
      return monthNum !== 12; // Default to Jan-Dec
  }
}

/**
 * Get the active month for a multi-month frequency cycle.
 * When a FrequencyConfig is provided, uses the database-driven active_month.
 */
export function getActiveMonthForCycle(
  rawFrequency: FrequencyType | string | null,
  reviewMonth: string,
  reviewYear: number,
  frequencyCycleStart?: string | null,
  config?: FrequencyConfig | null
): string {
  const frequency = normalizeFrequency(rawFrequency);
  if (!frequency) return reviewMonth;

  // Resolve effective cycle option: per-KPI override → global config → hardcoded default
  const effectiveCycle = resolveEffectiveCycleOption(frequency, frequencyCycleStart, config?.sub_frequency);
  if (effectiveCycle) {
    const monthNum = getMonthNumber(reviewMonth);
    // Check if current month is locked in this cycle
    if (isMonthLockedByConfig(monthNum, effectiveCycle.lockedMonths)) {
      // Find which cycle group this month belongs to and return its active month
      return getActiveMonthFromConfig(monthNum, effectiveCycle.lockedMonths);
    }
    // Month is not locked — it IS the active month
    return reviewMonth;
  }

  // If we have a database config with active_month, use it to determine the cycle's active month
  if (config?.active_month && config?.locked_months) {
    const lockedMonths = config.locked_months as Record<string, number[]>;
    const monthNum = getMonthNumber(reviewMonth);
    return getActiveMonthFromConfig(monthNum, lockedMonths);
  }
  
  const monthNum = getMonthNumber(reviewMonth);
  
  switch (frequency) {
    case 'Bi-Monthly':
      return monthNum % 2 === 0 ? reviewMonth : getMonthName(monthNum + 1);
      
    case 'Quarterly':
      const quarterEnd = Math.ceil(monthNum / 3) * 3;
      return getMonthName(quarterEnd);
      
    case 'Half-Yearly':
      return monthNum <= 6 ? 'June' : 'December';
      
    case 'Yearly':
      const cycleStart = frequencyCycleStart || 'Jan-Dec';
      switch (cycleStart) {
        case 'Jan-Dec': return 'December';
        case 'Jul-Jun': return 'June';
        case 'Apr-Mar': return 'March';
        default: return 'December';
      }
      
    default:
      return reviewMonth;
  }
}

/**
 * Given a month number and locked_months config, find the active month for the cycle it belongs to.
 */
function getActiveMonthFromConfig(monthNum: number, lockedMonths: Record<string, number[]>): string {
  for (const [, months] of Object.entries(lockedMonths)) {
    if (months.includes(monthNum)) {
      // All months in this cycle = locked months + active month
      // Active month is the one immediately after the last locked month
      const sorted = [...months].sort((a, b) => a - b);
      const maxLocked = sorted[sorted.length - 1];
      const activeMonth = maxLocked >= 12 ? 1 : maxLocked + 1;
      // But check if wrapping: e.g. locked [10,11,12,1,2] → active is 3
      // Find the contiguous end considering wrapping
      let active = findActiveMonthForGroup(months);
      return getMonthName(active);
    }
  }
  // Month is not locked — it IS the active month
  return getMonthName(monthNum);
}

/**
 * For a group of locked months, find the active (review) month.
 * The active month is the one that follows the locked sequence.
 */
function findActiveMonthForGroup(lockedMonths: number[]): number {
  const set = new Set(lockedMonths);
  // Start from any locked month and walk forward until we find one not in the set
  let current = lockedMonths[0];
  for (let i = 0; i < 12; i++) {
    if (!set.has(current)) return current;
    current = current >= 12 ? 1 : current + 1;
  }
  return 12; // fallback
}

/**
 * Get all months in a frequency cycle.
 * When a FrequencyConfig is provided, uses the database-driven locked_months.
 */
export function getCycleMonths(
  rawFrequency: FrequencyType | string | null,
  reviewMonth: string,
  reviewYear: number,
  frequencyCycleStart?: string | null,
  config?: FrequencyConfig | null
): string[] {
  const frequency = normalizeFrequency(rawFrequency);
  if (!frequency) return [reviewMonth];
  
  const monthNum = getMonthNumber(reviewMonth);

  // Resolve effective cycle option: per-KPI override → global config → hardcoded default
  const effectiveCycle = resolveEffectiveCycleOption(frequency, frequencyCycleStart, config?.sub_frequency);
  if (effectiveCycle) {
    for (const [, months] of Object.entries(effectiveCycle.lockedMonths)) {
      const activeMonth = findActiveMonthForGroup(months);
      if (months.includes(monthNum) || activeMonth === monthNum) {
        return [...months, activeMonth].sort((a, b) => a - b).map(getMonthName);
      }
    }
  }

  // If we have config, find the cycle group this month belongs to
  if (config?.locked_months) {
    const lockedMonths = config.locked_months as Record<string, number[]>;
    for (const [, months] of Object.entries(lockedMonths)) {
      if (months.includes(monthNum)) {
        const activeMonth = findActiveMonthForGroup(months);
        return [...months, activeMonth].sort((a, b) => a - b).map(getMonthName);
      }
    }
    // Month is the active month — find which group it belongs to
    for (const [, months] of Object.entries(lockedMonths)) {
      const activeMonth = findActiveMonthForGroup(months);
      if (activeMonth === monthNum) {
        return [...months, activeMonth].sort((a, b) => a - b).map(getMonthName);
      }
    }
  }
  
  switch (frequency) {
    case 'Daily':
    case 'Weekly':
    case 'Monthly':
      return [reviewMonth];
      
    case 'Bi-Monthly':
      const biMonthlyStart = monthNum % 2 === 1 ? monthNum : monthNum - 1;
      return [getMonthName(biMonthlyStart), getMonthName(biMonthlyStart + 1)];
      
    case 'Quarterly':
      const quarterStart = Math.floor((monthNum - 1) / 3) * 3 + 1;
      return [
        getMonthName(quarterStart),
        getMonthName(quarterStart + 1),
        getMonthName(quarterStart + 2)
      ];
      
    case 'Half-Yearly':
      if (monthNum <= 6) {
        return ['January', 'February', 'March', 'April', 'May', 'June'];
      } else {
        return ['July', 'August', 'September', 'October', 'November', 'December'];
      }
      
    case 'Yearly':
      return [...MONTHS];
      
    default:
      return [reviewMonth];
  }
}

/**
 * Get the cycle label for display.
 * When a FrequencyConfig is provided, derives the label from the sub_frequency.
 */
export function getCycleLabel(
  rawFrequency: FrequencyType | string | null,
  reviewMonth: string,
  reviewYear: number,
  frequencyCycleStart?: string | null,
  config?: FrequencyConfig | null
): string {
  const frequency = normalizeFrequency(rawFrequency);
  if (!frequency) return reviewMonth;

  // Resolve effective cycle option: per-KPI override → global config → hardcoded default
  const effectiveCycle = resolveEffectiveCycleOption(frequency, frequencyCycleStart, config?.sub_frequency);
  if (effectiveCycle?.lockedMonths) {
    const monthNum = getMonthNumber(reviewMonth);
    for (const [key, months] of Object.entries(effectiveCycle.lockedMonths)) {
      const activeMonth = findActiveMonthForGroup(months);
      if (months.includes(monthNum) || activeMonth === monthNum) {
        return key;
      }
    }
  }

  // If config is available, use sub_frequency to build label
  if (config?.sub_frequency && config?.locked_months) {
    const monthNum = getMonthNumber(reviewMonth);
    const lockedMonths = config.locked_months as Record<string, number[]>;
    for (const [key, months] of Object.entries(lockedMonths)) {
      const activeMonth = findActiveMonthForGroup(months);
      if (months.includes(monthNum) || activeMonth === monthNum) {
        return key;
      }
    }
  }
  
  const monthNum = getMonthNumber(reviewMonth);
  
  switch (frequency) {
    case 'Daily':
    case 'Weekly':
    case 'Monthly':
      return reviewMonth;
      
    case 'Bi-Monthly':
      const biMonthlyStart = monthNum % 2 === 1 ? monthNum : monthNum - 1;
      return `${getMonthName(biMonthlyStart).slice(0, 3)}-${getMonthName(biMonthlyStart + 1).slice(0, 3)}`;
      
    case 'Quarterly':
      const quarter = Math.ceil(monthNum / 3);
      return `Q${quarter} (${getQuarterRange(quarter)})`;
      
    case 'Half-Yearly':
      return monthNum <= 6 ? 'H1 (Jan-Jun)' : 'H2 (Jul-Dec)';
      
    case 'Yearly':
      return `${reviewYear}`;
      
    default:
      return reviewMonth;
  }
}

function getQuarterRange(quarter: number): string {
  switch (quarter) {
    case 1: return 'Jan-Mar';
    case 2: return 'Apr-Jun';
    case 3: return 'Jul-Sep';
    case 4: return 'Oct-Dec';
    default: return '';
  }
}

/**
 * Check if submissions are allowed for a given sub-period
 */
export function canSubmitForSubPeriod(
  frequency: FrequencyType | string | null,
  subPeriodValue: string,
  currentDate: Date,
  reviewMonth: string,
  reviewYear: number
): boolean {
  if (!frequency) return true;
  
  switch (frequency) {
    case 'Daily':
      // Can submit for today or yesterday only
      const submissionDate = new Date(subPeriodValue);
      const today = currentDate;
      const yesterday = subDays(today, 1);
      return isSameDay(submissionDate, today) || isSameDay(submissionDate, yesterday);
      
    case 'Weekly':
      // Check if we're in the review window for the week
      const weekNum = parseInt(subPeriodValue);
      const dayOfMonth = currentDate.getDate();
      const currentMonth = format(currentDate, 'MMMM');
      const currentYear = currentDate.getFullYear();
      
      if (weekNum <= 4) {
        const window = WEEKLY_REVIEW_WINDOWS[`week_${weekNum}`];
        return (
          currentMonth === reviewMonth &&
          currentYear === reviewYear &&
          dayOfMonth >= window.start &&
          dayOfMonth <= window.end
        );
      } else {
        // Week 5 - reviewed in next month
        const week5Window = WEEKLY_REVIEW_WINDOWS['week_5'];
        const nextMonth = getMonthNumber(reviewMonth) === 12 ? 'January' : getMonthName(getMonthNumber(reviewMonth) + 1);
        const nextYear = getMonthNumber(reviewMonth) === 12 ? reviewYear + 1 : reviewYear;
        
        return (
          currentMonth === nextMonth &&
          currentYear === nextYear &&
          dayOfMonth >= week5Window.start &&
          dayOfMonth <= week5Window.end
        );
      }
      
    default:
      return true;
  }
}

/**
 * Get the locked months in a cycle (months that should show locked/blurred state)
 */
export function getLockedMonthsInCycle(
  frequency: FrequencyType | string | null,
  reviewMonth: string,
  reviewYear: number
): string[] {
  const cycleMonths = getCycleMonths(frequency, reviewMonth, reviewYear);
  const activeMonth = getActiveMonthForCycle(frequency, reviewMonth, reviewYear);
  
  return cycleMonths.filter(month => month !== activeMonth);
}

/**
 * Determine if frequency requires sub-period selection (Daily/Weekly)
 */
export function requiresSubPeriodSelection(rawFrequency: FrequencyType | string | null): boolean {
  const frequency = normalizeFrequency(rawFrequency);
  return frequency === 'Daily' || frequency === 'Weekly';
}

/**
 * Determine if frequency has multi-month cycle behavior
 */
export function hasMultiMonthCycle(rawFrequency: FrequencyType | string | null): boolean {
  const frequency = normalizeFrequency(rawFrequency);
  return ['Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'].includes(frequency || '');
}

/**
 * Check if the cycle for a multi-month frequency has completed.
 * For terminal months: returns true only if today > last day of terminal month.
 * For sibling months: always returns false (handled by isKpiLockedForPeriod).
 * For single-month frequencies (Daily/Weekly/Monthly): always returns true.
 */
export function isCycleComplete(
  rawFrequency: FrequencyType | string | null,
  reviewMonth: string,
  reviewYear: number,
  frequencyCycleStart?: string | null,
  config?: FrequencyConfig | null
): boolean {
  const frequency = normalizeFrequency(rawFrequency);
  if (!frequency) return true;

  // Single-month frequencies: always reviewable (no cycle to wait for)
  if (!hasMultiMonthCycle(frequency)) return true;

  // If month is a sibling (locked), it's never directly reviewable
  if (isKpiLockedForPeriod(frequency, reviewMonth, reviewYear, frequencyCycleStart, config)) {
    return false;
  }

  // Terminal month: check if the month has actually ended
  const monthNum = getMonthNumber(reviewMonth);
  const lastDayOfMonth = new Date(reviewYear, monthNum, 0); // day 0 of next month = last day of this month
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return today > lastDayOfMonth;
}

/**
 * Get all possible review_period values that cover a given month.
 * Used by KRA Issuance to fetch non-monthly KPIs whose cycle includes the selected month.
 * E.g. for "February" → ['February', 'Q1', 'Q3', 'Q4', 'H1', 'H2', 'Jan-Dec', 'Apr-Mar', 'Jul-Jun', 'Jan-Feb', 'Feb-Mar']
 */
/**
 * Calculate the due date for a KPI based on its frequency and review period.
 * Returns the date after which the KPI is considered overdue.
 */
export function getKpiDueDate(frequency: string | null, reviewPeriod: string | null, reviewYear: number | null): Date | null {
  if (!reviewPeriod || reviewPeriod === '-' || !reviewYear) return null;

  const monthNum = getMonthNumber(reviewPeriod); // 1-12
  const norm = normalizeFrequency(frequency);

  switch (norm) {
    case 'Bi-Monthly': {
      const cycleEnd = monthNum % 2 === 0 ? monthNum : monthNum + 1;
      if (cycleEnd >= 12) return new Date(reviewYear + 1, 0, 1);
      return new Date(reviewYear, cycleEnd, 1);
    }
    case 'Quarterly': {
      const qEnd = Math.ceil(monthNum / 3) * 3;
      if (qEnd >= 12) return new Date(reviewYear + 1, 0, 1);
      return new Date(reviewYear, qEnd, 1);
    }
    case 'Half-Yearly': {
      if (monthNum <= 6) return new Date(reviewYear, 6, 1);
      return new Date(reviewYear + 1, 0, 1);
    }
    case 'Yearly': {
      return new Date(reviewYear + 1, 0, 1);
    }
    default: {
      if (monthNum >= 12) return new Date(reviewYear + 1, 0, 1);
      return new Date(reviewYear, monthNum, 1);
    }
  }
}

export function getAllPeriodsForMonth(monthName: string): string[] {
  const periods: string[] = [monthName];
  const monthNum = getMonthNumber(monthName);

  const allOptionSets = [
    BI_MONTHLY_OPTIONS,
    QUARTERLY_OPTIONS,
    HALF_YEARLY_OPTIONS,
    YEARLY_OPTIONS,
  ];

  for (const optionSet of allOptionSets) {
    for (const opt of optionSet) {
      for (const [label, lockedMonths] of Object.entries(opt.lockedMonths)) {
        const activeMonth = findActiveMonthForGroup(lockedMonths);
        if (lockedMonths.includes(monthNum) || activeMonth === monthNum) {
          periods.push(label);
        }
      }
    }
  }

  return [...new Set(periods)];
}

/**
 * Build a UX descriptor for the multi-month cycle scope shown in admin KPI dialogs.
 *
 * Returns the full cycle months, the review (anchor) month, and the year for the
 * anchor month — accounting for cycles that wrap year-end (e.g. Quarterly Nov →
 * Nov, Dec, Jan-of-next-year).
 *
 * Pure function — safe for unit testing and reuse across create/edit dialogs.
 */
export function buildCycleScopeLabel(
  rawFrequency: FrequencyType | string | null,
  reviewMonth: string,
  reviewYear: number,
  frequencyCycleStart?: string | null,
  config?: FrequencyConfig | null
): {
  isMultiMonth: boolean;
  cycleMonths: string[];
  anchorMonth: string;
  anchorYear: number;
  wrapsYear: boolean;
} {
  const frequency = normalizeFrequency(rawFrequency);
  const cycleMonths = getCycleMonths(frequency, reviewMonth, reviewYear, frequencyCycleStart, config);
  const anchorMonth = getActiveMonthForCycle(frequency, reviewMonth, reviewYear, frequencyCycleStart, config);

  // Multi-month frequencies are those that produce a cycle span > 1 month.
  const isMultiMonth = cycleMonths.length > 1;

  // Detect whether the cycle wraps the calendar year. Strategy: if the anchor
  // month index is numerically less than the selected review month index AND
  // the review month is also part of the cycle, the anchor lives in the next
  // calendar year.
  const reviewMonthNum = getMonthNumber(reviewMonth);
  const anchorMonthNum = getMonthNumber(anchorMonth);
  let wrapsYear = false;
  if (isMultiMonth) {
    const cycleNums = cycleMonths.map(getMonthNumber);
    const min = Math.min(...cycleNums);
    const max = Math.max(...cycleNums);
    // A wrapping cycle has a non-contiguous numeric range (e.g. [11,12,1])
    const isContiguous = max - min + 1 === cycleNums.length;
    wrapsYear = !isContiguous && anchorMonthNum < reviewMonthNum;
  }

  const anchorYear = wrapsYear ? reviewYear + 1 : reviewYear;

  return {
    isMultiMonth,
    cycleMonths,
    anchorMonth,
    anchorYear,
    wrapsYear,
  };
}
