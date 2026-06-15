import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * POLICY §112 — `public.propagate_org_kpi_value` MUST enforce a
 * per-`kpi_id` authorization gate (Admin OR registered data owner via
 * normalized KRA/KPI). Source-level guard: the latest migration that
 * redefines the function must mention `has_role(..., 'admin'` and
 * `org_kpi_data_owners` AND skip with reason `not_authorized` for
 * unauthorized rows.
 */
function latestPropagateMigrationBody(): string {
  const dir = join(process.cwd(), 'supabase/migrations');
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(dir, files[i]), 'utf8');
    if (body.includes('CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value')) {
      return body;
    }
  }
  throw new Error('No migration redefining propagate_org_kpi_value found');
}

describe('propagate_org_kpi_value authorization gate (POLICY §112)', () => {
  const body = latestPropagateMigrationBody();

  it('checks admin role via has_role', () => {
    expect(body).toMatch(/has_role\(\s*v_user\s*,\s*'admin'::public\.app_role\s*\)/);
  });

  it('matches data owners via org_kpi_data_owners using normalized text', () => {
    expect(body).toMatch(/org_kpi_data_owners\s+o/);
    expect(body).toMatch(/normalize_kpi_text\(o\.kra_name\)/);
    expect(body).toMatch(/normalize_kpi_text\(o\.kpi_name\)/);
  });

  it('emits a skip with reason not_authorized for unauthorized rows', () => {
    expect(body).toMatch(/'reason'\s*,\s*'not_authorized'/);
  });

  it('preserves the four-policy contract', () => {
    expect(body).toMatch(/'safe','pre_review_only','force_pre_terminal','overwrite_and_stepback'/);
  });
});