import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * CAPA-2026-07 / §88.6 / ADR-106 source-level guard.
 *
 * Every self-owning write in `useAdminDataEntry.ts` that stamps
 * `achieved_value` MUST mirror the frozen `self_achieved_value` snapshot
 * in the same UPDATE. Otherwise the Self card resolver
 * (`resolveSelfAchievedValue`) keeps returning the stale snapshot while
 * `achieved_value` / `self_score` reflect the corrected value.
 *
 * Reviewer-stage writers (`role_level !== 'self'`) MUST NOT touch
 * `self_achieved_value` — the write-once invariant is what protects the
 * self card from auditor/manager overrides (§88.1.d / ADR-098).
 */
describe('useAdminDataEntry — self snapshot mirror invariant', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/hooks/useAdminDataEntry.ts'),
    'utf8',
  );

  it('pairs every self-branch achieved_value write with a self_achieved_value write', () => {
    // Find the self branch inside buildUpdateFields.
    const selfBlock = src.match(
      /if \(roleLevel === 'self'\) \{[\s\S]*?fields\.achieved_value[\s\S]*?\}/,
    );
    expect(selfBlock, 'expected the self branch in buildUpdateFields').not.toBeNull();
    expect(selfBlock![0]).toContain('fields.self_achieved_value');
  });

  it('does not stamp self_achieved_value on any reviewer-stage branch', () => {
    // Reviewer paths write `<role>_achieved_value` via bracket notation;
    // they must never touch the frozen self snapshot.
    const reviewerBranch = src.match(
      /\} else \{\s*fields\[`\$\{roleLevel\}_achieved_value`\]/,
    );
    expect(reviewerBranch, 'expected the reviewer branch').not.toBeNull();
    // The reviewer branch itself must not contain self_achieved_value.
    const reviewerSlice = src.slice(reviewerBranch!.index!, reviewerBranch!.index! + 200);
    expect(reviewerSlice).not.toContain('self_achieved_value');
  });
});
