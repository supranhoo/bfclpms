/** ADR-255 — TNI secure qualification and action-record UX contracts. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const latestMigration = path.join(root, 'supabase/migrations/20260812034637_a00e2e25-e872-481e-bdb7-76ed89b64aca.sql');

describe('TNI zero-record CAPA', () => {
  it('secures qualification with report authorization and row scope', () => {
    const sql = fs.readFileSync(latestMigration, 'utf8');
    expect(sql).toMatch(/tni_qualified_kpis[\s\S]*SECURITY DEFINER/);
    expect(sql).toMatch(/report_key = 'tni'/);
    expect(sql).toMatch(/can_view_kpi_row/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.tni_qualified_kpis[\s\S]*FROM PUBLIC, anon/);
  });

  it('keeps action-record writes Admin-only in both backend and UI', () => {
    const sql = fs.readFileSync(latestMigration, 'utf8');
    const ui = fs.readFileSync(path.join(root, 'src/pages/reports/TNIReport.tsx'), 'utf8');
    expect(sql).toMatch(/Only Admin can create TNI action records/);
    expect(ui).toMatch(/isAdmin && isMulti/);
    expect(ui).toMatch(/Create Action Records \(\{periodRanges\.length\} months\)/);
    expect(ui).not.toMatch(/Backfill Range/);
  });

  it('surfaces every report dependency failure and does not imply detection gates qualification', () => {
    const ui = fs.readFileSync(path.join(root, 'src/pages/reports/TNIReport.tsx'), 'utf8');
    expect(ui).toMatch(/thresholdError \|\| minMonthsError \|\| qualifiedError \|\| rawNeedsError \|\| profilesError/);
    expect(ui).toMatch(/Qualification is calculated directly from score evidence and remains visible/);
    expect(ui).not.toMatch(/No TNI data detected/);
  });
});