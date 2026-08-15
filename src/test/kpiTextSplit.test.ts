import { describe, it, expect } from 'vitest';
import {
  splitKpiText,
  composeKpiName,
  resolveKpiText,
  kpiFiscalStartYear,
  isStructuredKpiPeriod,
} from '@/lib/kpiTextSplit';

const CLEAN = `Coal Consumption Ratio
- Description: Measures coal used per unit of power generated.
- Formula: Total coal (MT) / Net units generated (MU)
- Scoring Logic: R5 <= 0.70, R3 <= 0.80, R0 > 0.90`;

describe('splitKpiText', () => {
  it('splits a clean three-part KPI with high confidence', () => {
    const p = splitKpiText(CLEAN);
    expect(p.title).toBe('Coal Consumption Ratio');
    expect(p.description).toBe('Measures coal used per unit of power generated.');
    expect(p.formula).toBe('Total coal (MT) / Net units generated (MU)');
    expect(p.scoring_logic).toBe('R5 <= 0.70, R3 <= 0.80, R0 > 0.90');
    expect(p.confidence).toBe('high');
  });

  it('flags scoring-only text for review', () => {
    const p = splitKpiText('Safety Observations\nScoring: 5 per closure');
    expect(p.formula).toBeNull();
    expect(p.scoring_logic).toBe('5 per closure');
    expect(p.confidence).toBe('review');
  });

  it('flags formula-only text for review', () => {
    const p = splitKpiText('Uptime\n- Formula: run hrs / total hrs');
    expect(p.scoring_logic).toBeNull();
    expect(p.confidence).toBe('review');
  });

  it('marks marker-less names as unparsed and keeps them as the title', () => {
    const p = splitKpiText('Housekeeping Score');
    expect(p.title).toBe('Housekeeping Score');
    expect(p.confidence).toBe('unparsed');
  });

  it('marks an over-long first line for review, not high', () => {
    const p = splitKpiText(`${'x'.repeat(140)}\n- Formula: a/b\n- Scoring Logic: z`);
    expect(p.confidence).toBe('review');
  });

  it('handles empty / null input', () => {
    expect(splitKpiText(null).confidence).toBe('empty');
    expect(splitKpiText('   ').confidence).toBe('empty');
  });
});

describe('composeKpiName', () => {
  it('round-trips a clean canonical shape', () => {
    expect(composeKpiName(splitKpiText(CLEAN))).toBe(CLEAN);
  });

  it('omits blank sections', () => {
    expect(composeKpiName({ title: 'A', formula: 'x/y' })).toBe('A\n- Formula: x/y');
  });
});

describe('resolveKpiText', () => {
  it('prefers structured columns when present', () => {
    const r = resolveKpiText({ kpi_name: CLEAN, kpi_title: 'Structured Title', kpi_formula: 'f' });
    expect(r.isStructured).toBe(true);
    expect(r.title).toBe('Structured Title');
  });

  it('falls back to parsing legacy free text', () => {
    const r = resolveKpiText({ kpi_name: CLEAN });
    expect(r.isStructured).toBe(false);
    expect(r.title).toBe('Coal Consumption Ratio');
  });
});

describe('fiscal cutover', () => {
  it('maps Jul-Dec to the same year and Jan-Jun to the previous year', () => {
    expect(kpiFiscalStartYear('July', 2026)).toBe(2026);
    expect(kpiFiscalStartYear('June', 2027)).toBe(2026);
    expect(kpiFiscalStartYear('June', 2026)).toBe(2025);
  });

  it('treats July 2026 onward as structured and earlier periods as legacy', () => {
    expect(isStructuredKpiPeriod('July', 2026)).toBe(true);
    expect(isStructuredKpiPeriod('June', 2027)).toBe(true);
    expect(isStructuredKpiPeriod('June', 2026)).toBe(false);
    expect(isStructuredKpiPeriod('May', 2026)).toBe(false);
    expect(isStructuredKpiPeriod(null, 2026)).toBe(false);
  });
});
