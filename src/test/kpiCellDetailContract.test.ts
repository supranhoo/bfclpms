import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function latestMigrationContaining(needle: string): string {
  const dir = join(process.cwd(), 'supabase/migrations');
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(dir, files[i]), 'utf8');
    if (body.includes(needle)) return body;
  }

  throw new Error(`No migration contains: ${needle}`);
}

describe('kpi_cell_detail RPC contract', () => {
  const body = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.kpi_cell_detail');

  it('uses the live organization KPI values table, not the obsolete org_kpis relation', () => {
    expect(body).toContain('FROM public.org_kpi_values o');
    expect(body).not.toContain('public.org_kpis');
  });

  it('preserves category enrichment and the supported workflow helper', () => {
    expect(body).toContain("'kra_categories'");
    expect(body).toContain('LEFT JOIN public.kra_categories c ON c.id = k.category_id');
    expect(body).toContain('SELECT public.get_employee_workflow(p_emp_id, v_review_period, v_review_year)');
    expect(body).not.toContain('resolve_employee_workflow');
  });
});