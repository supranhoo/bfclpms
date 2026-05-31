// Unit tests for the per-employee increment-method scope resolver.
// Mirrors the inline resolveMethodConfig() inside index.ts. Kept here as a
// pure function so we can prove specificity + tie-break behaviour without
// spinning up the full edge-function runtime.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

type Dims = {
  company_id: string | null;
  division_id: string | null;
  business_unit_id: string | null;
  location_id: string | null;
  employee_category_id: string | null;
  level_id: string | null;
};

type Cfg = {
  id: string;
  method: 'full' | 'prorated_doj' | 'custom';
  version: number;
  created_at?: string;
  company_id?: string | null;
  division_id?: string | null;
  business_unit_id?: string | null;
  category_id?: string | null;
  level_id?: string | null;
  location_id?: string | null;
};

function resolveMethodConfig(dims: Dims, methodConfigs: Cfg[]): Cfg | null {
  const candidates = methodConfigs.filter((c) =>
    (!c.company_id || c.company_id === dims.company_id) &&
    (!c.division_id || c.division_id === dims.division_id) &&
    (!c.business_unit_id || c.business_unit_id === dims.business_unit_id) &&
    (!c.category_id || c.category_id === dims.employee_category_id) &&
    (!c.level_id || c.level_id === dims.level_id) &&
    (!c.location_id || c.location_id === dims.location_id),
  );
  if (!candidates.length) return null;
  const score = (c: Cfg) =>
    (c.company_id ? 1 : 0) + (c.division_id ? 1 : 0) + (c.business_unit_id ? 1 : 0) +
    (c.category_id ? 1 : 0) + (c.level_id ? 1 : 0) + (c.location_id ? 1 : 0);
  candidates.sort((a, b) => {
    const ds = score(b) - score(a);
    if (ds !== 0) return ds;
    const dv = (Number(b.version) || 0) - (Number(a.version) || 0);
    if (dv !== 0) return dv;
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  });
  return candidates[0];
}

const emp = (over: Partial<Dims> = {}): Dims => ({
  company_id: 'C1', division_id: null, business_unit_id: null,
  location_id: null, employee_category_id: null, level_id: null, ...over,
});

Deno.test('only a global config — applies to everyone', () => {
  const cfgs: Cfg[] = [{ id: 'g', method: 'full', version: 1 }];
  assertEquals(resolveMethodConfig(emp(), cfgs)?.method, 'full');
  assertEquals(resolveMethodConfig(emp({ company_id: 'C9' }), cfgs)?.method, 'full');
});

Deno.test('company override beats global for in-scope employees only', () => {
  const cfgs: Cfg[] = [
    { id: 'g', method: 'full', version: 2 },
    { id: 'c', method: 'prorated_doj', version: 3, company_id: 'C1' },
  ];
  assertEquals(resolveMethodConfig(emp({ company_id: 'C1' }), cfgs)?.method, 'prorated_doj');
  assertEquals(resolveMethodConfig(emp({ company_id: 'C2' }), cfgs)?.method, 'full');
});

Deno.test('higher specificity (company + level) beats company-only', () => {
  const cfgs: Cfg[] = [
    { id: 'g', method: 'full', version: 5 },
    { id: 'c', method: 'prorated_doj', version: 4, company_id: 'C1' },
    { id: 'cl', method: 'custom', version: 1, company_id: 'C1', level_id: 'L1' },
  ];
  assertEquals(
    resolveMethodConfig(emp({ company_id: 'C1', level_id: 'L1' }), cfgs)?.method,
    'custom',
  );
});

Deno.test('tie on specificity — higher version wins', () => {
  const cfgs: Cfg[] = [
    { id: 'old', method: 'full', version: 2, company_id: 'C1' },
    { id: 'new', method: 'prorated_doj', version: 5, company_id: 'C1' },
  ];
  assertEquals(resolveMethodConfig(emp({ company_id: 'C1' }), cfgs)?.id, 'new');
});

Deno.test('no candidate matches — returns null', () => {
  const cfgs: Cfg[] = [{ id: 'c', method: 'full', version: 1, company_id: 'C9' }];
  assertEquals(resolveMethodConfig(emp({ company_id: 'C1' }), cfgs), null);
});

Deno.test('exact DB shape from RCA — global full vs company prorated', () => {
  // Mirrors AY 2025-26 state at incident time.
  const cfgs: Cfg[] = [
    { id: 'v2', method: 'full', version: 2 },
    { id: 'v3', method: 'prorated_doj', version: 3, company_id: '1759cc34' },
  ];
  // Vivek (company 1759cc34) gets the company-scoped override.
  assertEquals(
    resolveMethodConfig(emp({ company_id: '1759cc34' }), cfgs)?.method,
    'prorated_doj',
  );
  // An employee in a different company gets the global Full Increment.
  assertEquals(
    resolveMethodConfig(emp({ company_id: 'OTHER' }), cfgs)?.method,
    'full',
  );
});