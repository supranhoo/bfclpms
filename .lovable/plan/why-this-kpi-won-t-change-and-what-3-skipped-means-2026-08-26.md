# Why this KPI won't change — and what "3 skipped" means

## Verified diagnosis

The KPI is *Ensure target availability of Kiln and all associated equipment* (KRA: Asset
Availability & Reliability), July 2026, 3 mapped rows:

| Employee | Code | Status | Final score |
| --- | --- | --- | --- |
| Biswanatha Mahanta | 101944 | approved | 5.00 |
| Devendra Kumar Yadav | 100707 | approved | 5.00 |
| K Srinivasa Rao | 100705 | approved | 5.00 |

All three carry an **approved final score**, so they are immutable under POLICY §88 unless the
change set is *purely descriptive* (ADR-323 automatic bypass).

Your change set is `Title, Description, Formula, Scope`. Title/Description/Formula are
descriptive — **Scope (`org_level_scope`) is not**. One non-descriptive field flips the whole run
onto the strict protected path, so every row is skipped with reason `final_score_locked`, and the
run reports "0 rows will change · 3 skipped".

Worse, you never asked to change Scope. The group definition for this KPI is internally
inconsistent: `is_org_level = false` on all three rows, yet one row (K Srinivasa Rao) still holds
`org_level_scope = 'organization'`. With the Organisation-level KPI toggle off, the editor emits a
"clear the scope" change automatically — a phantom edit that costs you the descriptive bypass.

## Five whys

1. Nothing changed → every row was skipped as protected.
2. Skipped as protected → all three rows have approved final scores and the run was not descriptive-only.
3. Not descriptive-only → `org_level_scope` was in the change set.
4. Scope was in the change set → the definition carries a stale scope while org-level is off, so the dialog diffs it to empty.
5. That was invisible → the per-month preview only says "protected rows skipped", never which reason or which fields caused it.

Root cause: an all-or-nothing safety classification plus a phantom scope diff, reported without a cause.

## Fix

1. **No phantom scope change.** When the Organisation-level toggle is off and was already off,
   the editor stops emitting `org_level_scope` and the scope target columns. Scope is inert for a
   non-org KPI, so clearing it is not an edit. This alone makes your run descriptive-only and the
   three rows update.
2. **Field-level partitioning instead of all-or-nothing.** In a mixed change set on a locked row,
   apply the descriptive fields and skip only the protected ones, recording the row as
   `partially_applied` with the exact fields withheld. Scores, targets, weightage, bands,
   frequency and workflow status stay untouched.
3. **Honest preview.** Replace "protected rows skipped" with the reason breakdown
   (`Final score approved — immutable`, `Already in review`, …), the employee names, and a line
   naming which fields in the current change set are blocking the descriptive bypass.
4. **Repair the inconsistent rows.** A one-off cleanup nulls `org_level_scope` where
   `is_org_level = false`, so the phantom diff cannot reappear on other KPIs.

## Technical notes

- `GroupDefinitionEditDialog.tsx`: gate `org_level_scope` + `KPI_ROW_TARGET_COLUMNS` out of the
  diff when `orgLevel === false && original.is_org_level === false`.
- `bu_console_group_edit_definition`: per-row, split `p_changes` into descriptive vs protected. If
  the row is locked (`final_score_locked` / `past_kra_set` without `allow_locked`) and descriptive
  keys exist, write only those and report `partially_applied` with `withheld_fields`. Fully
  protected rows keep their current reason. Same rule in the commit path so preview and commit
  agree.
- `useBuConsole.ts`: add `partially_applied` to `GROUP_EDIT_SKIP_LABELS`, surface
  `withheld_fields`; per-month preview rows render the reason mix.
- Migration also runs the scope cleanup `UPDATE public.kpis SET org_level_scope = NULL WHERE
  is_org_level = false AND org_level_scope IS NOT NULL` (no score/status column touched).
- No schema change, no RLS change. Rollback = restore the previous function body and client files;
  every committed run stays individually undoable.

## Tests

- `groupEditModel.test.ts` — no scope key emitted when org-level is and stays off; scope still
  travels when the toggle is on.
- `editFieldClass.test.ts` — partition helper: descriptive vs withheld for mixed sets.
- New `groupEditPartition.test.ts` — mixed set on a locked row yields descriptive writes plus
  `withheld_fields`; fully protected set still skips.

## Docs

`docs/adr/ADR-326.md`, DOCUMENTATION.md (Performance Console → group edit protection),
POLICY.md §CONSOLE-PARTIAL-DESCRIPTIVE-APPLY, version history entry.

## Risk

- Data: strictly narrower writes than today on protected rows (descriptive text only). The scope
  cleanup only nulls a field that is already ignored when `is_org_level = false`.
- Regression: low; scoring, weightage and workflow paths untouched. Preview and commit share the
  same partition logic so counts cannot diverge.
