import { describe, it, expect } from 'vitest';
import { REPORT_CATALOG, REPORT_CATALOG_BY_ID, flattenCatalog } from './catalog';

describe('report catalog — Phase 5 Tier A seed', () => {
  it('each Tier A report has at least one required field and unique field keys', () => {
    const tierA = ['RPT-KRA-001', 'RPT-DEP-001', 'RPT-VAR-001', 'RPT-ISS-001', 'RPT-PERF-001'];
    for (const id of tierA) {
      const rep = REPORT_CATALOG_BY_ID[id];
      expect(rep, `${id} missing from catalog`).toBeDefined();
      const fields = rep.fields ?? [];
      expect(fields.length, `${id} has no seeded fields`).toBeGreaterThan(0);
      expect(fields.some((f) => f.is_required), `${id} has no required field`).toBe(true);
      const keys = fields.map((f) => f.field_key);
      expect(new Set(keys).size, `${id} has duplicate field_keys`).toBe(keys.length);
    }
  });

  it('all report_ids are unique', () => {
    const ids = REPORT_CATALOG.map((r) => r.report_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('flattenCatalog produces report_id-bound field rows', () => {
    const { reports, fields } = flattenCatalog();
    expect(reports.length).toBe(REPORT_CATALOG.length);
    for (const f of fields) {
      expect(REPORT_CATALOG_BY_ID[f.report_id]).toBeDefined();
    }
  });
});