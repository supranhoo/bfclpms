import { describe, it, expect } from 'vitest';
import {
  getCurrentAssessmentYear,
  getCurrentAssessmentYearStart,
  generateAssessmentYears,
  formatAssessmentYear,
} from './assessmentYear';

describe('assessmentYear util', () => {
  it('treats June as previous AY', () => {
    expect(getCurrentAssessmentYearStart(new Date(2026, 5, 30))).toBe(2025);
    expect(getCurrentAssessmentYear(new Date(2026, 5, 30))).toBe('2025-26');
  });
  it('treats July as new AY', () => {
    expect(getCurrentAssessmentYearStart(new Date(2026, 6, 1))).toBe(2026);
    expect(getCurrentAssessmentYear(new Date(2026, 6, 1))).toBe('2026-27');
  });
  it('formats two-digit suffix correctly across century', () => {
    expect(formatAssessmentYear(2099)).toBe('2099-00');
  });
  it('generates newest-first list including current AY', () => {
    const list = generateAssessmentYears(2, new Date(2026, 4, 1)); // May 2026 → current 2025-26
    expect(list[0]).toBe('2027-28');
    expect(list).toContain('2025-26');
    expect(list[list.length - 1]).toBe('2023-24');
  });
});