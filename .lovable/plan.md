## Problem
On `/admin/org-kpi-data`, when a scoped Org KPI card has typed-but-unsaved values in multiple rows, clicking the per-row **Save** icon persists that row correctly but blanks the typed Achieved/Remarks in the other unsaved rows. Reported by Vivek Dansena.

## Root cause
In `src/components/admin/OrgKpiEntryCard.tsx`:

1. `performSave(scopeId)` calls `clearAllDirty()`, which resets `isDirtyRef.current = false`, `cardDirty = false`, and empties `dirtyScopeIds` — even though only one row was flushed.
2. The following refetch fires the primary merge effect (deps include `data.scopedRows`). With `isDirtyRef.current === false`, `sameScopedSignature` is now false (the saved row's value changed), so the effect falls into the reset branch and calls `setScopedValues(data.scopedRows!)`, preserving only `evidenceUrl` for rows in `touchedEvidenceScopeIdsRef`. Local Achieved/Remarks edits for other touched rows are dropped.

## Fix (surgical, UI/state only)
File: `src/components/admin/OrgKpiEntryCard.tsx`

1. Replace the single `clearAllDirty()` call inside `performSave` with scoped clearing:
   - **Card Save** (`scopeId` undefined): keep current `clearAllDirty()` behavior.
   - **Row Save**: remove only `scopeId` from `dirtyScopeIds`, remove it from `touchedScopeIdsRef` and `touchedEvidenceScopeIdsRef`, and set `isDirtyRef.current = (cardDirty || remainingDirtyScopeIds.size > 0)`. Do not touch `cardDirty`.
2. In the primary merge effect's reset branch (around line 438–451), when rebuilding `scopedValues` from `data.scopedRows`, preserve local edits for any `scopeId` still in `touchedScopeIdsRef`:
   - Keep local `achievedValue`, `remarks`, `isNa`, `subFactors`.
   - Continue preserving `evidenceUrl` via `touchedEvidenceScopeIdsRef`.
3. `saveStatus` semantics: after a row Save, set to `'saved'` only if no rows remain dirty; otherwise keep `'unsaved'` so the amber "Unsaved changes" pill stays visible for the rest.

No changes to `onSave`, RPCs, schema, RLS, or `OrgKpiScopedEntryTable`.

## Verification
- Manual: open a scoped Org KPI card with ≥3 mapped employees, type Achieved + Remarks in rows A, B, C; click Save on row A. Expect: row A pill = "Saved", rows B & C retain typed values, card pill = "Unsaved", Propagate buttons still disabled until B & C are saved.
- Unit test (`src/components/admin/__tests__/OrgKpiEntryCard.rowSave.test.tsx`): mount the card with 3 scoped rows, mock `onSave` to resolve and a follow-up `data.scopedRows` prop that reflects row A persisted; type into A, B, C; fire row-A Save; assert rows B & C still hold typed values and remain dirty.

## Risk & impact
- Scope: single component, UI state only. No data migration, no RLS change.
- Regression risk: low — card-level Save path is unchanged; existing tests for ADR-075 (explicit Save) and ADR-080 (narrowed payload) still hold.
- Rollback: revert the file (single commit).

## Docs / memory
- Append a note to `mem/features/admin/org-kpi-data-entry-manual-save.md`: row-Save MUST scope dirty clearing to the saved `scopeId`; merge effect's reset branch MUST honor `touchedScopeIdsRef` for value/remarks/isNa/subFactors.
- Add ADR-081 "Per-row Save preserves sibling unsaved edits" under `docs/adr/`.

## Out of scope
- Reintroducing autosave.
- Server RPC changes.
- Evidence/parity flows (already correct via `touchedEvidenceScopeIdsRef`).
