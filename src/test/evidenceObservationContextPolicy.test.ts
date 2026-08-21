import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('ADR-307 observation evidence context contract', () => {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), 'utf8'));
  const finalMigration = [...migrations]
    .reverse()
    .find((sql) => sql.includes('can_read_evidence_context'));

  it('resolves observation contexts and supports legacy KPI contexts', () => {
    expect(finalMigration).toBeDefined();
    expect(finalMigration).toContain("'observation-evidence'::text");
    expect(finalMigration).toContain("'observation-replies'::text");
    expect(finalMigration).toMatch(/FROM public\.kpi_observations o[\s\S]*o\.id = p_context_id/);
    expect(finalMigration).toMatch(/FROM public\.kpis k[\s\S]*k\.id = p_context_id/);
    expect(finalMigration).toContain('can_read_kpi_evidence(_kpi_id)');
  });

  it('uses signed-in-only invoker execution', () => {
    expect(finalMigration).toContain('SECURITY INVOKER');
    expect(finalMigration).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon/);
    expect(finalMigration).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated, service_role/);
  });

  it('routes the final participant read policy through the resolver', () => {
    const allSql = migrations.join('\n');
    const policyIndex = allSql.lastIndexOf('CREATE POLICY "Review evidence readable by KPI participants"');
    expect(policyIndex).toBeGreaterThan(-1);
    expect(allSql.slice(policyIndex, policyIndex + 1_500)).toContain('can_read_evidence_context');
  });
});