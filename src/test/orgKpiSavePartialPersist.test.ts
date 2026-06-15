import { describe, it, expect } from 'vitest';

/**
 * POLICY §112 — Org KPI Save → Propagate integrity.
 *
 * `handleCardSave` MUST throw when the bulk save RPC persisted fewer
 * rows than were attempted. The thrown error aborts the chained
 * Propagate so the user never propagates a value that did not reach
 * the database (root cause of "Partial propagation: 0/1 employees
 * updated", June 2026 RCA).
 */
function assertFullPersist(attempted: number, persisted: number): void {
  if (attempted > 0 && persisted < attempted) {
    const err = new Error(
      `Save persisted ${persisted} of ${attempted} row(s). Refresh and retry before propagating.`,
    );
    (err as any).code = 'ORG_KPI_PARTIAL_SAVE';
    throw err;
  }
}

describe('Org KPI partial-persist guard (POLICY §112)', () => {
  it('passes when every attempted row was persisted', () => {
    expect(() => assertFullPersist(3, 3)).not.toThrow();
  });

  it('throws ORG_KPI_PARTIAL_SAVE when zero rows were persisted', () => {
    let caught: any;
    try { assertFullPersist(1, 0); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('ORG_KPI_PARTIAL_SAVE');
  });

  it('throws when some but not all rows were persisted', () => {
    expect(() => assertFullPersist(5, 3)).toThrow(/persisted 3 of 5/);
  });

  it('is a no-op when nothing was attempted', () => {
    expect(() => assertFullPersist(0, 0)).not.toThrow();
  });
});