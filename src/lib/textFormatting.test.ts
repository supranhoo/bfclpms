import { describe, it, expect } from 'vitest';
import { normalizeKpiText, preWrapClass, getKpiSummaryText } from './textFormatting';

describe('normalizeKpiText', () => {
  describe('messy existing data (missing newlines)', () => {
    it('inserts newline before - Description:', () => {
      const input = 'KPI Title - Description: Some description';
      const expected = 'KPI Title\n- Description: Some description';
      expect(normalizeKpiText(input)).toBe(expected);
    });

    it('inserts newlines before multiple markers', () => {
      const input = 'KPI Name - Description: Desc - Formula: F - Scoring Logic: SL';
      const result = normalizeKpiText(input);
      expect(result).toContain('\n- Description:');
      expect(result).toContain('\n- Formula:');
      expect(result).toContain('\n- Scoring Logic:');
    });

    it('handles all supported markers', () => {
      const markers = ['Description', 'Formula', 'Scoring Logic', 'Criteria', 'Measurement', 'Target', 'Note'];
      markers.forEach(marker => {
        const input = `KPI Title - ${marker}: value`;
        const result = normalizeKpiText(input);
        expect(result).toContain(`\n- ${marker}:`);
      });
    });

    it('handles variations with extra spaces', () => {
      const input = 'KPI Title   - Description: value';
      const result = normalizeKpiText(input);
      expect(result).toContain('\n- Description:');
    });
  });

  describe('clean new data (already has newlines)', () => {
    it('preserves existing newlines', () => {
      const input = 'KPI Name\n- Description: Desc\n- Formula: F';
      expect(normalizeKpiText(input)).toBe(input);
    });

    it('does not double-insert newlines', () => {
      const input = 'KPI Name\n- Description: Desc';
      const result = normalizeKpiText(input);
      expect(result).not.toContain('\n\n');
    });
  });

  describe('edge cases', () => {
    it('handles null gracefully', () => {
      expect(normalizeKpiText(null)).toBe('');
    });

    it('handles undefined gracefully', () => {
      expect(normalizeKpiText(undefined)).toBe('');
    });

    it('handles empty string', () => {
      expect(normalizeKpiText('')).toBe('');
    });

    it('handles text without markers', () => {
      const input = 'Simple KPI without sections';
      expect(normalizeKpiText(input)).toBe(input);
    });

    it('is case-insensitive', () => {
      const input = 'KPI - DESCRIPTION: Desc - formula: F';
      const result = normalizeKpiText(input);
      expect(result).toContain('\n- DESCRIPTION:');
      expect(result).toContain('\n- formula:');
    });

    it('handles plurals like Notes:', () => {
      const input = 'KPI Title - Notes: Some notes';
      const result = normalizeKpiText(input);
      expect(result).toContain('\n- Notes:');
    });
  });

  describe('idempotency', () => {
    it('running normalizer twice yields same result', () => {
      const input = 'KPI Name - Description: Desc - Formula: F';
      const once = normalizeKpiText(input);
      const twice = normalizeKpiText(once);
      expect(twice).toBe(once);
    });
  });

  describe('complex real-world examples', () => {
    it('handles full KPI name with all sections', () => {
      const input = 'Accuracy of New Employee Documentation: - Description: Measures the completeness and accuracy of all required onboarding documents. - Formula: (1 - (Number of files with errors / Total files)) * 100. - Scoring Logic: (Scoring: 5 for 100% accuracy, 4 for 98-99.9%, 3 for 95-97.9%)';
      
      const result = normalizeKpiText(input);
      
      expect(result).toBe('Accuracy of New Employee Documentation:\n- Description: Measures the completeness and accuracy of all required onboarding documents.\n- Formula: (1 - (Number of files with errors / Total files)) * 100.\n- Scoring Logic: (Scoring: 5 for 100% accuracy, 4 for 98-99.9%, 3 for 95-97.9%)');
    });

    it('handles non-standard "Formula -" variant', () => {
      const input = 'KPI Title Formula - (some formula details)';
      const result = normalizeKpiText(input);
      expect(result).toContain('\nFormula -');
    });

    it('handles non-standard "Scoring :-" variant', () => {
      const input = 'KPI Title Scoring :- 5 for 100%';
      const result = normalizeKpiText(input);
      expect(result).toContain('\nScoring :-');
    });

    it('does not match "Scoring:" inside parentheses', () => {
      const input = '- Scoring Logic: (Scoring: 5 for 100%)';
      const result = normalizeKpiText(input);
      // Should not insert newline before "(Scoring:"
      expect(result).not.toContain('\nScoring: 5');
    });
  });
});

describe('preWrapClass', () => {
  it('exports the correct tailwind class', () => {
    expect(preWrapClass).toBe('whitespace-pre-wrap');
  });
});
