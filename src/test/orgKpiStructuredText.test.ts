/**
 * ADR-351 — Org KPI Data Entry must render KPI text through the structured
 * resolver, not the raw `kpi_name` blob.
 */
import { describe, it, expect } from 'vitest';
import { resolveKpiText } from '@/lib/kpiTextSplit';

const LEGACY_BLOB =
  "Achieve Power generation target from WHRB 1050 TPD .:\n- Formula: Power generation from WHRB 1050 TPD as per Incentive %\n- Scoring Logic: Rating 5: ≥ 20%, Rating 0: <90%";

describe('Org KPI Data Entry — structured KPI text', () => {
  it('renders the structured title when the console has updated the KPI', () => {
    const parts = resolveKpiText({
      kpi_name: LEGACY_BLOB,
      kpi_title: 'Achieve 1050 TPD Power Generation  target',
      kpi_description: 'Power generation from WHRB 1050 TPD',
      kpi_formula: 'Power generation as per Incentive %',
      kpi_scoring_logic: 'Rating 5: ≥ 20% ... Rating 0: <90%',
    });
    expect(parts.isStructured).toBe(true);
    expect(parts.title).toBe('Achieve 1050 TPD Power Generation  target');
    expect(parts.formula).toContain('Incentive %');
    expect(parts.scoring_logic).toContain('Rating 5');
  });

  it('falls back to the legacy text when no structured title exists', () => {
    const parts = resolveKpiText({ kpi_name: LEGACY_BLOB, kpi_title: null });
    expect(parts.isStructured).toBe(false);
  });

  it('keeps kpi_name as the matching key even when structured text exists', () => {
    const row = { kpi_name: LEGACY_BLOB, kpi_title: 'New title' };
    // Display changes, key does not.
    expect(resolveKpiText(row).title).toBe('New title');
    expect(row.kpi_name).toBe(LEGACY_BLOB);
  });
});

describe('snapshot payload contract', () => {
  it('carries the four structured columns from get_org_kpi_data_entry_snapshot', () => {
    const snapshotKpi = {
      kpi_name: LEGACY_BLOB,
      kpi_title: 'Achieve 1050 TPD Power Generation  target',
      kpi_description: 'desc',
      kpi_formula: 'formula',
      kpi_scoring_logic: 'logic',
    };
    for (const f of ['kpi_title', 'kpi_description', 'kpi_formula', 'kpi_scoring_logic']) {
      expect(snapshotKpi).toHaveProperty(f);
    }
    expect(resolveKpiText(snapshotKpi).isStructured).toBe(true);
  });
});
