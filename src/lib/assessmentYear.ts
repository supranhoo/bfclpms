/**
 * Canonical Assessment Year helpers — Jul–Jun fiscal cycle.
 * AY label format: "YYYY-YY" (e.g. "2025-26" for Jul 2025 – Jun 2026).
 */

export function getCurrentAssessmentYearStart(d: Date = new Date()): number {
  // Month is 0-indexed; July = 6. From July onward we enter the next AY.
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

export function formatAssessmentYear(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function getCurrentAssessmentYear(d: Date = new Date()): string {
  return formatAssessmentYear(getCurrentAssessmentYearStart(d));
}

/**
 * Rolling list of assessment years centered on the current AY.
 * Returned newest-first so dropdowns can index [0] without sorting.
 */
export function generateAssessmentYears(spread = 4, d: Date = new Date()): string[] {
  const start = getCurrentAssessmentYearStart(d);
  const years: string[] = [];
  for (let i = spread; i >= -spread; i--) {
    years.push(formatAssessmentYear(start + i));
  }
  return years; // newest-first
}