// Deno tests for `evaluatePostCutoff` — post-cutoff joiner detection and
// balance-month carry forward to the next assessment year.
//
// Run: `deno test supabase/functions/compute-increment/post_cutoff_carry_forward_test.ts`
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluatePostCutoff } from './index.ts';

const AY_START = new Date('2025-07-01T00:00:00Z');
const AY_END = new Date('2026-06-30T00:00:00Z');

Deno.test('Post-cutoff joiner with carry-forward ON → carries balance months', () => {
  // GDOJ 20 Jan 2026, cutoff 31 Dec 2025 → balance Feb-Jun = 5 months
  const r = evaluatePostCutoff({
    gdoj: new Date('2026-01-20T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 12, cutoffDay: 31,
    carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, true);
  assertEquals(r.carryForwardMonths, 5);
});

Deno.test('Post-cutoff joiner with carry-forward OFF → no months carried', () => {
  const r = evaluatePostCutoff({
    gdoj: new Date('2026-01-20T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 12, cutoffDay: 31,
    carryForwardEnabled: false,
  });
  assertEquals(r.isPostCutoffJoiner, true);
  assertEquals(r.carryForwardMonths, 0);
});

Deno.test('GDOJ on cutoff date → not post-cutoff (normal calc)', () => {
  const r = evaluatePostCutoff({
    gdoj: new Date('2025-12-31T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 12, cutoffDay: 31,
    carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, false);
  assertEquals(r.carryForwardMonths, 0);
});

Deno.test('GDOJ before cutoff → not post-cutoff', () => {
  const r = evaluatePostCutoff({
    gdoj: new Date('2025-10-15T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 12, cutoffDay: 31,
    carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, false);
});

Deno.test('GDOJ outside AY → feature inactive', () => {
  const r = evaluatePostCutoff({
    gdoj: new Date('2024-05-01T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 12, cutoffDay: 31,
    carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, false);
  assertEquals(r.carryForwardMonths, 0);
});

Deno.test('Cutoff not configured → inactive', () => {
  const r = evaluatePostCutoff({
    gdoj: new Date('2026-01-20T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: null, cutoffDay: null,
    carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, false);
  assertEquals(r.cutoffDateISO, null);
});

Deno.test('GDOJ missing → inactive', () => {
  const r = evaluatePostCutoff({
    gdoj: null, ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 12, cutoffDay: 31, carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, false);
});

Deno.test('Cutoff day past month length safely clamps (Feb 30 → Feb 28/29)', () => {
  // Cutoff Feb 30 in AY 2025-26 → resolves inside Feb 2026 (28 days)
  const r = evaluatePostCutoff({
    gdoj: new Date('2026-03-05T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 2, cutoffDay: 30,
    carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, true);
  // Balance = Apr, May, Jun = 3
  assertEquals(r.carryForwardMonths, 3);
});

Deno.test('Post-cutoff joiner near AY end → small carry', () => {
  // GDOJ 10 May 2026, cutoff 31 Dec 2025 → balance Jun = 1
  const r = evaluatePostCutoff({
    gdoj: new Date('2026-05-10T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 12, cutoffDay: 31,
    carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, true);
  assertEquals(r.carryForwardMonths, 1);
});

Deno.test('Post-cutoff joiner in last AY month → zero balance carry', () => {
  // GDOJ 15 Jun 2026 → no full months after Jun, balance = 0
  const r = evaluatePostCutoff({
    gdoj: new Date('2026-06-15T00:00:00Z'),
    ayStart: AY_START, ayEnd: AY_END,
    cutoffMonth: 12, cutoffDay: 31,
    carryForwardEnabled: true,
  });
  assertEquals(r.isPostCutoffJoiner, true);
  assertEquals(r.carryForwardMonths, 0);
});