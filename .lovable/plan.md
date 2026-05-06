## Goal

Make the Org KPI tile chip and the Propagate dialog derive their "is there anything left to propagate?" verdict from one shared, pure helper. Today the two surfaces compute the same idea in two different places (tile uses `getKpiStatus` over `mappedEmpIds` + `kraSetEmpIds` + OKV.status; dialog summarises the RPC `breakdown[]`). Any future tweak risks them diverging again — exactly the bug ADR-055 just fixed.

## Design

Introduce `src/lib/orgKpiStatus.ts` as the single source of truth. Pure functions, no React, no Supabase imports — fully unit-testable and reusable in both surfaces.

```ts
// src/lib/orgKpiStatus.ts
export type OrgKpiTileStatus = 'pending' | 'entered' | 'propagated' | 'stuck';

export type OkvLike = { status?: string | null; achieved_value?: number | null; is_na?: boolean | null };

export interface DeriveTileStatusInput {
  scope: 'employee' | 'department' | 'organization';
  okvRows: OkvLike[];                 // matched OKV rows in the current scope
  mappedEmpIds: Set<string>;          // all employees mapped to this org KPI def
  kraSetEmpIds: Set<string>;          // mapped employees whose child kpis row is still 'kra_set'
  // for stuck detection in employee/department scope:
  matchedEmpIds?: Set<string>;        // employees that have a propagated OKV row (employee scope)
  matchedDeptEmpIds?: Set<string>;    // employees in the propagated departments (dept scope)
}

export function deriveOrgKpiTileStatus(input: DeriveTileStatusInput): OrgKpiTileStatus;

// Mirror summary used by PropagationPreviewDialog so its headline ("0 will advance —
// nothing left to propagate") is computed from the SAME predicate.
export interface PreviewBreakdownRow {
  will_advance: boolean;
  reason: string;             // 'eligible' | 'not_in_kra_set' | 'reviewer_locked' | ...
  value_changes?: boolean;
  current_self_score?: number | null;
}
export interface PreviewVerdict {
  total: number;
  willAdvance: number;
  willSkip: number;
  lockedCount: number;
  overwriteCount: number;
  effectivelyPropagated: boolean;   // true iff total > 0 && willAdvance === 0
                                    // && every skip reason is in {not_in_kra_set, reviewer_locked, self_review_existing}
}
export function summarisePropagationPreview(rows: PreviewBreakdownRow[]): PreviewVerdict;
```

Both helpers share a small private predicate `isAlreadyAdvancedPastKraSet(...)` so the rules cannot drift.

## Wiring

1. **`src/pages/admin/OrgKpiDataEntry.tsx`** — replace the 70-line inline `getKpiStatus` body with a thin wrapper that builds the input from the existing maps and calls `deriveOrgKpiTileStatus`. Keep the `useCallback` and the existing tooltip copy.
2. **`src/components/admin/PropagationPreviewDialog.tsx`** — replace the four ad-hoc counters (`willAdvance`, `willSkip`, `lockedCount`, `overwriteCount`, `allSkipped`) with `summarisePropagationPreview(preview.breakdown)`. Use `verdict.effectivelyPropagated` to render the existing red "all skipped" banner, and add one new line directly under the badges: *"Tile shows Propagated for this reason — no employee can be advanced."* — so the two surfaces visibly agree.
3. **`src/hooks/useOrgLevelKpis.ts`** — no change to the query, but export the `Set` builders that the page already does inline so the page can hand them straight to the helper without re-shaping.

## Tests

- **`src/test/orgKpiStatusShared.test.ts`** (new): the eight cases that currently live duplicated in `orgKpiTileStatus.test.ts` plus three preview-summary cases (all eligible, all reviewer-locked, mixed). Drive both helpers from the same fixture rows to prove parity.
- Keep `src/test/orgKpiTileStatus.test.ts` as a thin re-export that calls the shared helper, so the existing regression net stays green.
- No new dialog snapshot test — the verdict object is asserted directly.

## Files

- New: `src/lib/orgKpiStatus.ts`, `src/test/orgKpiStatusShared.test.ts`, `docs/adr/ADR-056.md`.
- Edit: `src/pages/admin/OrgKpiDataEntry.tsx`, `src/components/admin/PropagationPreviewDialog.tsx`, `src/test/orgKpiTileStatus.test.ts`, `mem/features/admin/org-kpi-management-suite`, `CHANGELOG_2026.md`.
- No DB migration. No RPC change. RLS unaffected.

## Risk & Impact

- **Data:** none. Pure refactor of derivation logic; same inputs, same outputs.
- **Workflow:** none. Propagate button still calls the same RPC.
- **UI/UX:** tile semantics unchanged; dialog gains one explanatory line when `effectivelyPropagated` is true so users see *why* the tile says Propagated.
- **Regression risk:** low — the new helper is covered by the migrated tests plus parity tests. The page and dialog become thinner, not richer.
- **Mitigation:** parity test fixtures drive both helpers from one source; old `orgKpiTileStatus.test.ts` kept as a guardrail.

## Out of scope

- Changing the RPC, OKV.status backfill, or any propagation semantics.
- Visual redesign of the dialog beyond the one consistency line.
