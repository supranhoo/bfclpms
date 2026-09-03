/**
 * ADR-356 — presentation contract for the reviewer KPI card (tablet/mobile).
 * Guards the findings from the UI assessment: one status badge per card,
 * readable type scale, aligned metric grid, semantic tokens, touch targets.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/components/review/MobileKpiCard.tsx'), 'utf8');

describe('MobileKpiCard presentation', () => {
  it('does not duplicate workflow state in the action row', () => {
    expect(src).not.toMatch(/>\s*Fwd\s*</);
    expect(src).not.toMatch(/>\s*Done\s*</);
  });

  it('keeps a single canonical status badge driven by statusLabels', () => {
    const occurrences = src.match(/statusLabels\[kpi\.status\]/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it('uses semantic colour variants instead of raw palette utilities', () => {
    expect(src).not.toMatch(/(bg|text|border)-(amber|green|blue|red|emerald)-\d{2,3}/);
    expect(src).toContain('variant="warning"');
  });

  it('drops sub-12px type from labels and titles', () => {
    expect(src).not.toContain('text-[10px]');
    expect(src).not.toContain('text-[9px]');
  });

  it('renders Target / Weight / Score as an aligned tabular grid', () => {
    expect(src).toContain('grid grid-cols-3');
    const tabular = src.match(/tabular-nums/g) ?? [];
    expect(tabular.length).toBeGreaterThanOrEqual(3);
  });

  it('shows the rating scale alongside the score', () => {
    expect(src).toContain('MAX_RATING_SCORE');
  });

  it('suppresses non-printable unit strings such as Number and Date', () => {
    expect(src).toContain('NON_PRINTABLE_UOMS');
  });

  it('gives every interactive control a >=44px touch target', () => {
    expect(src).not.toMatch(/className="h-8/);
    const touch = src.match(/min-h-\[44px\]/g) ?? [];
    expect(touch.length).toBeGreaterThanOrEqual(4);
  });

  it('labels icon-only controls for screen readers', () => {
    expect(src).toContain('aria-label="Send back for rework"');
    expect(src).toContain('aria-label="Show KPI scoring logic"');
  });
});
