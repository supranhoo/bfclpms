// Pure unit tests for `monthsServedInAY` — the AY-bounded month counter that
// honours the configurable "Joining Month Cutoff Day" rule for prorated_doj.
//
// Run: `deno test supabase/functions/compute-increment/joining_month_cutoff_test.ts`
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { monthsServedInAY } from './index.ts';

const AY_START = new Date('2025-07-01T00:00:00Z');
const AY_END = new Date('2026-06-30T00:00:00Z');
const VAL = AY_END;

Deno.test('DOJ 14 Apr 2026, cutoff 15 → joining month counted (Apr-Jun = 3)', () => {
  const r = monthsServedInAY(new Date('2026-04-14T00:00:00Z'), 15, AY_START, AY_END, VAL);
  assertEquals(r.decision, 'included');
  assertEquals(r.months, 3);
});

Deno.test('DOJ 15 Apr 2026, cutoff 15 → excluded (May-Jun = 2)', () => {
  const r = monthsServedInAY(new Date('2026-04-15T00:00:00Z'), 15, AY_START, AY_END, VAL);
  assertEquals(r.decision, 'excluded');
  assertEquals(r.months, 2);
});

Deno.test('DOJ 16 Apr 2026, cutoff 15 → excluded', () => {
  const r = monthsServedInAY(new Date('2026-04-16T00:00:00Z'), 15, AY_START, AY_END, VAL);
  assertEquals(r.decision, 'excluded');
  assertEquals(r.months, 2);
});

Deno.test('DOJ 10 Jul 2025, cutoff 15, validation 31 Mar 2026 → 9 months', () => {
  const r = monthsServedInAY(
    new Date('2025-07-10T00:00:00Z'),
    15,
    AY_START,
    AY_END,
    new Date('2026-03-31T00:00:00Z'),
  );
  assertEquals(r.decision, 'included');
  assertEquals(r.months, 9);
});

Deno.test('DOJ before AY (1 Jan 2025) → pre_ay, full 12', () => {
  const r = monthsServedInAY(new Date('2025-01-01T00:00:00Z'), 15, AY_START, AY_END, VAL);
  assertEquals(r.decision, 'pre_ay');
  assertEquals(r.months, 12);
});

Deno.test('DOJ after AY end (1 Jul 2026) → after_ay, 0 months', () => {
  const r = monthsServedInAY(new Date('2026-07-01T00:00:00Z'), 15, AY_START, AY_END, VAL);
  assertEquals(r.decision, 'after_ay');
  assertEquals(r.months, 0);
});

Deno.test('Cutoff 31 with DOJ in 30-day month → joining day < 31 ⇒ included (safe)', () => {
  // April has 30 days; DOJ 30 Apr 2026, cutoff 31.
  const r = monthsServedInAY(new Date('2026-04-30T00:00:00Z'), 31, AY_START, AY_END, VAL);
  assertEquals(r.decision, 'included');
  assertEquals(r.months, 3);
});

Deno.test('Cutoff 1 → every DOJ-day >= 1 is excluded except impossible day 0', () => {
  const r = monthsServedInAY(new Date('2026-04-01T00:00:00Z'), 1, AY_START, AY_END, VAL);
  assertEquals(r.decision, 'excluded');
  assertEquals(r.months, 2);
});

Deno.test('Result clamped to 12 even on very long windows', () => {
  const r = monthsServedInAY(
    new Date('2020-01-01T00:00:00Z'),
    15,
    AY_START,
    AY_END,
    AY_END,
  );
  assertEquals(r.months, 12);
});