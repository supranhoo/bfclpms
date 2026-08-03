import { describe, it, expect } from 'vitest';
import {
  orphanSystemScoreKeys,
  orphanSystemScorePoints,
  pruneOrphanSystemScores,
  templateScopedSystemPoints,
} from './systemScoreScope';

// Anil Kumar Pathak (200301) regression: KRA-only template, two orphan slots
// carried over from "CLU - M - Operation".
const kraSlots = [{ id: 'sys_bgd6797' }];
const stored = { sys_bgd6797: 49.8, sys_2z4e0vw: 10, sys_3jsce5p: 25 };

describe('systemScoreScope — ADR-234', () => {
  it('flags keys absent from the effective template', () => {
    expect(orphanSystemScoreKeys(kraSlots, stored).sort()).toEqual(['sys_2z4e0vw', 'sys_3jsce5p']);
  });

  it('reports the inflated point amount', () => {
    expect(orphanSystemScorePoints(kraSlots, stored)).toBe(35);
  });

  it('sums only declared slots (49.80, not 84.80)', () => {
    expect(templateScopedSystemPoints(kraSlots, stored)).toBe(49.8);
  });

  it('KRA rating parity: 49.8 / 100 * 5 = 2.49', () => {
    const pts = templateScopedSystemPoints(kraSlots, stored);
    expect(Number(((pts / 100) * 5).toFixed(2))).toBe(2.49);
  });

  it('prunes orphans while keeping remapped keys', () => {
    expect(pruneOrphanSystemScores(kraSlots, stored)).toEqual({ sys_bgd6797: 49.8 });
  });

  it('is a no-op when every key is declared', () => {
    const slots = [{ id: 'a' }, { id: 'b' }];
    const m = { a: 1, b: 2 };
    expect(orphanSystemScoreKeys(slots, m)).toEqual([]);
    expect(templateScopedSystemPoints(slots, m)).toBe(3);
  });

  it('handles null/empty inputs safely', () => {
    expect(templateScopedSystemPoints(null, null)).toBe(0);
    expect(orphanSystemScoreKeys(null, { x: 1 })).toEqual(['x']);
    expect(orphanSystemScorePoints([{ id: 'x' }], { x: 'bad' as unknown as number })).toBe(0);
  });
});