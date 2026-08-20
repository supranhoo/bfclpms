import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20260820065232_b3d29f9a-c038-4b2a-b8aa-9d34f88d48b0.sql',
  'utf8',
);

describe('ADR-303 evidence authorization plan', () => {
  it('removes superseded overlapping read policies', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Users can view authorized evidence"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Observation evidence readable by KPI participants"');
  });

  it('indexes the late organizational owner branch by owner first', () => {
    expect(migration).toMatch(/idx_okdo_owner_id[\s\S]*org_kpi_data_owners\s*\(owner_id\)/);
  });

  it('keeps anonymous callers from executing the security-definer helper', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.can_read_kpi_evidence(uuid) FROM PUBLIC, anon');
    expect(migration).toContain('TO authenticated, service_role');
  });
});