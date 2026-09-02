/**
 * ADR-341 — Target is a value-based (numeric) KPI property only.
 * ADR-342 — Org KPI propagation resolver must have exactly one overload.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { typeOwnsTarget, kpiOwnsTarget } from '@/lib/kpiScoringModel';
import { targetForType } from '@/components/admin/bu-console/groupEditModel';
import { rowEditableFields } from '@/components/admin/bu-console/rowOverrideModel';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const allMigrations = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');

describe('ADR-341 — target ownership predicate', () => {
  it('is true only for value-based KPIs', () => {
    expect(typeOwnsTarget('numeric')).toBe(true);
    expect(typeOwnsTarget(null)).toBe(true); // legacy rows default to numeric
    expect(typeOwnsTarget('binary')).toBe(false);
    expect(typeOwnsTarget('tiered')).toBe(false);
    expect(kpiOwnsTarget({ uom_type: 'tiered' })).toBe(false);
  });

  it('clears the target when the group moves to a qualitative type', () => {
    expect(targetForType('numeric', '15')).toBe('15');
    expect(targetForType('binary', '15')).toBe('');
    expect(targetForType('tiered', '15')).toBe('');
  });

  it('drops target from the per-employee tuning fields for qualitative KPIs', () => {
    expect(rowEditableFields({ uom_type: 'numeric' })).toContain('target_value');
    expect(rowEditableFields({ uom_type: 'binary' })).not.toContain('target_value');
    expect(rowEditableFields({ uom_type: 'tiered', qualitative_options: [] }))
      .not.toContain('target_value');
  });
});

describe('ADR-341 — server invariant', () => {
  it('installs a trigger that nulls target_value for non-numeric rows', () => {
    const sql = allMigrations();
    expect(sql).toContain('enforce_target_is_value_based');
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF uom_type, target_value ON public\.kpis/);
  });
});

describe('ADR-342 — propagation resolver overload', () => {
  it('drops the stale 8-argument resolver so the client call is unambiguous', () => {
    const sql = allMigrations();
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.resolve_org_kpi_target_kpis\(\s*uuid, text, text, text, integer, text, uuid, uuid\s*\)/,
    );
  });

  it('calls the resolver with the argument names the surviving signature accepts', () => {
    const hook = readFileSync(
      join(process.cwd(), 'src', 'hooks', 'usePropagateOrgKpiValue.ts'),
      'utf8',
    );
    const allowed = [
      'p_category_id', 'p_kra_name', 'p_kpi_name', 'p_review_period',
      'p_review_year', 'p_scope', 'p_department_id', 'p_employee_id', 'p_target_id',
    ];
    const call = hook.slice(hook.indexOf("rpc('resolve_org_kpi_target_kpis'"));
    const block = call.slice(0, call.indexOf('});'));
    const used = [...block.matchAll(/\b(p_[a-z_]+):/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    used.forEach((arg) => expect(allowed).toContain(arg));

  });
});
