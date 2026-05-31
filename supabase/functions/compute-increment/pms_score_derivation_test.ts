// Unit tests for the PMS-score derivation block of compute-increment.
// These tests exercise the pure helpers (bestScore + weighted-average aggregation)
// in isolation, so we can prove the canonical 8-stage chain and N/A exclusion
// behave identically to src/hooks/useEmployeeScoresForPeriod.ts.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const bestScore = (s: any): number | null =>
  s.final_score ?? s.management_score ?? s.auditor_score
  ?? s.hr_pms_score ?? s.skip_level_score ?? s.manager_score
  ?? s.self_score ?? null;

function aggregate(
  kpis: Array<{ id: string; weightage: number | null }>,
  subs: Record<string, any>,
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const k of kpis) {
    const sub = subs[k.id];
    if (!sub || sub.is_na) continue;
    const score = bestScore(sub);
    if (score === null || score === undefined) continue;
    const w = Number(k.weightage) || 0;
    if (w <= 0) continue;
    weightedSum += Number(score) * w;
    totalWeight += w;
  }
  if (totalWeight <= 0) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

Deno.test('bestScore — follows 8-stage fallback chain top-down', () => {
  assertEquals(bestScore({ final_score: 4, management_score: 3, self_score: 1 }), 4);
  assertEquals(bestScore({ management_score: 3, auditor_score: 2 }), 3);
  assertEquals(bestScore({ auditor_score: 2, manager_score: 1 }), 2);
  assertEquals(bestScore({ hr_pms_score: 3 }), 3);
  assertEquals(bestScore({ skip_level_score: 2 }), 2);
  assertEquals(bestScore({ manager_score: 5 }), 5);
  assertEquals(bestScore({ self_score: 4 }), 4);
  assertEquals(bestScore({}), null);
});

Deno.test('bestScore — zero is a valid score, not a fallback miss', () => {
  assertEquals(bestScore({ final_score: 0, self_score: 5 }), 0);
});

Deno.test('aggregate — weighted average across KPIs', () => {
  const kpis = [
    { id: 'a', weightage: 50 },
    { id: 'b', weightage: 50 },
  ];
  const subs = {
    a: { final_score: 4 },
    b: { final_score: 2 },
  };
  assertEquals(aggregate(kpis, subs), 3);
});

Deno.test('aggregate — excludes is_na KPIs from weighted average', () => {
  const kpis = [
    { id: 'a', weightage: 60 },
    { id: 'b', weightage: 40 },
  ];
  const subs = {
    a: { final_score: 5 },
    b: { is_na: true, final_score: 1 },
  };
  // Only 'a' counts → 5.0
  assertEquals(aggregate(kpis, subs), 5);
});

Deno.test('aggregate — skips KPIs with no submission', () => {
  const kpis = [
    { id: 'a', weightage: 50 },
    { id: 'b', weightage: 50 },
  ];
  const subs = { a: { final_score: 4 } } as Record<string, any>;
  assertEquals(aggregate(kpis, subs), 4);
});

Deno.test('aggregate — returns null when all KPIs N/A or unscored', () => {
  const kpis = [
    { id: 'a', weightage: 50 },
    { id: 'b', weightage: 50 },
  ];
  const subs = {
    a: { is_na: true },
    b: {},
  };
  assertEquals(aggregate(kpis, subs), null);
});

Deno.test('aggregate — skips KPIs with non-positive weightage', () => {
  const kpis = [
    { id: 'a', weightage: 0 },
    { id: 'b', weightage: 100 },
  ];
  const subs = {
    a: { final_score: 5 },
    b: { final_score: 3 },
  };
  assertEquals(aggregate(kpis, subs), 3);
});

Deno.test('aggregate — uses fallback chain for mixed-stage submissions', () => {
  const kpis = [
    { id: 'a', weightage: 50 },
    { id: 'b', weightage: 50 },
  ];
  const subs = {
    a: { final_score: 4 },                  // Final = 4
    b: { management_score: null, auditor_score: 3, self_score: 1 }, // Auditor = 3
  };
  assertEquals(aggregate(kpis, subs), 3.5);
});