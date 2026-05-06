import { describe, it, expect } from 'vitest';
import { normalizeText } from '@/lib/orgKpiKey';

/**
 * ADR-057 parity guard. The SQL function public.normalize_kpi_text MUST
 * produce the same canonical form as the JS normalizeText helper, otherwise
 * the new RLS join will silently miss rows and data owners will see blank
 * Org KPI Data Entry screens again.
 *
 * SQL definition:
 *   btrim(regexp_replace(replace(lower(coalesce(p,'')), E'\r',''), '\s+',' ','g'))
 */
function sqlNormalize(s: string | null | undefined): string {
  if (s == null) return '';
  return s.toLowerCase().replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

describe('ADR-057 normalize_kpi_text parity', () => {
  const cases = [
    'Training & Development',
    'Completion of Mandated  Training Hours',
    'Completion of Mandated\r Training Hours',
    '  Control DUST Emission ',
    'Multi\nline\rwith\ttabs',
    '',
    'Already canonical',
  ];
  it.each(cases)('JS and SQL agree on %j', (input) => {
    expect(normalizeText(input)).toBe(sqlNormalize(input));
  });

  it('handles null/undefined like the SQL coalesce', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});
