import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Source-level invariants for the criterion_key alias resolver added to the
// increment engine after RCA 2026-05-31 (Vivek 101784 wrongly got 20%).
//
// The engine MUST:
//   1) Resolve legacy / admin-edited keys (`absent`, `lwp`,
//      `discipline_action`, `training`) to the canonical metric keys.
//   2) Fail CLOSED on unknown keys — mark the employee ineligible with a
//      "Configuration error" reason instead of silently skipping.
//   3) Keep the canonical keys working unchanged (regression guard).

const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('engine declares an alias map covering legacy criterion keys', () => {
  assertStringIncludes(src, "absent: 'absent_days'");
  assertStringIncludes(src, "lwp: 'lwp_days'");
  assertStringIncludes(src, "discipline_action: 'disciplinary_actions'");
  assertStringIncludes(src, "training: 'training_compliance'");
});

Deno.test('engine resolves criterion_key via metrics then aliases', () => {
  // resolveMetric must consult the canonical metrics map first, then ALIASES.
  assertStringIncludes(src, 'const resolveMetric');
  assertStringIncludes(src, 'ALIASES[k]');
});

Deno.test('engine fails closed on unknown criterion_key (no silent skip)', () => {
  // The old behaviour was `if (val === undefined) continue;` — that line MUST
  // be gone. The new branch pushes a "Configuration error" reason.
  assertEquals(src.includes('if (val === undefined || val === null) continue;'), false);
  assertStringIncludes(src, 'Configuration error');
});

// Pure-function replica of the engine block, used to lock in behaviour
// against representative inputs without booting Deno.serve.
const ALIASES: Record<string, string> = {
  absent: 'absent_days', absent_days: 'absent_days',
  lwp: 'lwp_days', lwp_days: 'lwp_days',
  discipline_action: 'disciplinary_actions', disciplinary_actions: 'disciplinary_actions',
  training: 'training_compliance', training_compliance: 'training_compliance',
};

function evaluate(
  input: { absent_days?: number; lwp_days?: number; disciplinary_actions?: number; training_compliance?: number },
  criteria: Array<{ criterion_key: string; criterion_name: string; comparison_operator: string; threshold_value: number }>,
): { eligibility: 'eligible' | 'ineligible'; reason: string | null } {
  const metrics: Record<string, number> = {
    absent_days: Number(input.absent_days ?? 0),
    lwp_days: Number(input.lwp_days ?? 0),
    disciplinary_actions: Number(input.disciplinary_actions ?? 0),
    training_compliance: Number(input.training_compliance ?? 0),
  };
  const resolveMetric = (rawKey: string): { key: string | null; val: number | null } => {
    const k = String(rawKey ?? '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(metrics, k)) return { key: k, val: Number(metrics[k]) };
    const aliased = ALIASES[k];
    if (aliased && Object.prototype.hasOwnProperty.call(metrics, aliased)) {
      return { key: aliased, val: Number(metrics[aliased]) };
    }
    return { key: null, val: null };
  };
  const failed: string[] = [];
  for (const c of criteria) {
    const { key, val } = resolveMetric(c.criterion_key);
    if (key === null || val === null || Number.isNaN(val)) {
      failed.push(`Configuration error: criterion '${c.criterion_name}' (key='${c.criterion_key}') is not mapped to any input metric — contact admin`);
      continue;
    }
    const t = Number(c.threshold_value);
    let breach = false;
    switch (c.comparison_operator) {
      case '>=': breach = val >= t; break;
      case '<=': breach = val <= t; break;
      case '>':  breach = val > t; break;
      case '<':  breach = val < t; break;
      case '=':  breach = val === t; break;
    }
    if (breach) failed.push(`${c.criterion_name} ${c.comparison_operator} ${t} (actual ${val})`);
  }
  return failed.length
    ? { eligibility: 'ineligible', reason: failed.join('; ') }
    : { eligibility: 'eligible', reason: null };
}

// ───── Scenario: Vivek 101784, AY 2025-26 (the original RCA). ─────
Deno.test('Vivek (absent_days=6) is ineligible when criterion_key="absent" and op=">" thr=0', () => {
  const r = evaluate(
    { absent_days: 6 },
    [{ criterion_key: 'absent', criterion_name: 'Absent', comparison_operator: '>', threshold_value: 0 }],
  );
  assertEquals(r.eligibility, 'ineligible');
  assertStringIncludes(r.reason ?? '', 'Absent > 0 (actual 6)');
});

Deno.test('clean employee (all zero) stays eligible under same criteria', () => {
  const r = evaluate(
    { absent_days: 0, lwp_days: 0, disciplinary_actions: 0 },
    [
      { criterion_key: 'absent',            criterion_name: 'Absent',           comparison_operator: '>', threshold_value: 0 },
      { criterion_key: 'lwp',               criterion_name: 'LWP',              comparison_operator: '>', threshold_value: 8 },
      { criterion_key: 'discipline_action', criterion_name: 'Discipline Action', comparison_operator: '>', threshold_value: 0 },
    ],
  );
  assertEquals(r.eligibility, 'eligible');
  assertEquals(r.reason, null);
});

Deno.test('canonical keys still work (regression guard)', () => {
  const r = evaluate(
    { absent_days: 12 },
    [{ criterion_key: 'absent_days', criterion_name: 'Absent Days', comparison_operator: '>=', threshold_value: 10 }],
  );
  assertEquals(r.eligibility, 'ineligible');
});

Deno.test('unknown criterion_key fails CLOSED with Configuration error', () => {
  const r = evaluate(
    { absent_days: 0 },
    [{ criterion_key: 'xyz_unmapped', criterion_name: 'Mystery Rule', comparison_operator: '>', threshold_value: 0 }],
  );
  assertEquals(r.eligibility, 'ineligible');
  assertStringIncludes(r.reason ?? '', 'Configuration error');
  assertStringIncludes(r.reason ?? '', 'Mystery Rule');
});