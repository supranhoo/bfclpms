import { describe, it, expect } from 'vitest';

/**
 * ADR-062 — Owner⇄KPI join must be whitespace-normalized.
 *
 * The DB helper `public.normalize_kpi_text` lowercases, trims and collapses
 * runs of whitespace (including newlines). Ownership rows imported from CSV
 * store " - " separators while UI-inserted KPI names use real "\n- " breaks;
 * raw equality silently truncated owner visibility (regression: Ankan saw 25
 * of 50 mapped employees). This guard locks the normalization behaviour on
 * the client mirror so future refactors keep both sides aligned.
 */

function normalizeKpiText(t: string | null | undefined): string {
  return (t ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

describe('orgKpiOwnerJoinNormalization', () => {
  it('treats newline and " - " separators as equal', () => {
    const owner = 'Completion of Mandated Training Hours - Description: Fosters skill development...';
    const kpi   = 'Completion of Mandated Training Hours\n- Description: Fosters skill development...';
    expect(normalizeKpiText(owner)).toBe(normalizeKpiText(kpi));
  });

  it('ignores trailing whitespace and case differences', () => {
    expect(normalizeKpiText('  Foo  Bar\n')).toBe(normalizeKpiText('foo bar'));
  });

  it('does not collapse meaningful punctuation', () => {
    expect(normalizeKpiText('Foo: bar')).not.toBe(normalizeKpiText('Foo bar'));
  });
});