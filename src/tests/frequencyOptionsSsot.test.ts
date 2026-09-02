/**
 * ADR-343 — the frequency list is a single source of truth.
 * Every picker must render all seven canonical values; no screen may inline
 * its own array.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FREQUENCY_OPTIONS, MULTI_MONTH_FREQUENCIES } from '@/lib/frequencyCycleOptions';

const CANONICAL = ['Daily', 'Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

const CONSUMERS = [
  'src/components/admin/AdminKpiCreateDialog.tsx',
  'src/components/admin/AdminKpiEditorForm.tsx',
  'src/components/admin/TemplateFormDialog.tsx',
  'src/components/admin/bu-console/GroupDefinitionEditDialog.tsx',
  'src/components/admin/bu-console/RowOverrideDialog.tsx',
  'src/components/admin/kpi-form/FrequencyField.tsx',
];

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('ADR-343 frequency options SSOT', () => {
  it('exposes exactly the seven canonical frequencies, in order', () => {
    expect([...FREQUENCY_OPTIONS]).toEqual(CANONICAL);
  });

  it('keeps every multi-month frequency inside the canonical list', () => {
    for (const f of MULTI_MONTH_FREQUENCIES) expect(CANONICAL).toContain(f);
  });

  it('no consumer inlines its own frequency array', () => {
    for (const path of CONSUMERS) {
      const src = read(path);
      expect(src, `${path} must not inline a frequency literal array`).not.toMatch(
        /\[\s*'Daily',\s*'Weekly'/,
      );
      expect(src, `${path} must not inline frequency SelectItems`).not.toMatch(
        /SelectItem value="Weekly"/,
      );
    }
  });

  it('the create dialog renders the shared field for numeric, binary and tiered', () => {
    const src = read('src/components/admin/AdminKpiCreateDialog.tsx');
    const uses = src.match(/<FrequencyField/g) ?? [];
    expect(uses.length).toBe(3);
    // each usage wires the cycle anchor, so a multi-month KPI can be anchored
    // regardless of scoring type
    const anchors = src.match(/onCycleStartChange=\{setFrequencyCycleStart\}/g) ?? [];
    expect(anchors.length).toBe(3);
  });

  it('the shared field only offers a cycle anchor for multi-month frequencies', () => {
    const src = read('src/components/admin/kpi-form/FrequencyField.tsx');
    expect(src).toContain('MULTI_MONTH_FREQUENCIES.includes(frequency)');
    expect(src).toContain('FREQUENCY_OPTIONS.map');
  });
});
