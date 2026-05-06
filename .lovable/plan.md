
## Problem

On `/admin/org-kpi-data`, "Budget saving" is tagged **Entered** on the card, but the Propagate dialog reports **0 will advance, 1 reviewer-locked** (Ashish Kataria already at `manager_check`, self_score 4).

Two different "truths" are being shown for the same KPI because the card and the propagate preview read from two different sources:

| Surface | Source of truth |
|---|---|
| Card chip ("Pending / Entered / Propagated / Stuck") | `org_kpi_values.status` only |
| Propagate dialog | Real per-employee `kpis.status` |

When `org_kpi_values.status` is `draft`/`sent_back` but every mapped child has already advanced past `kra_set` (e.g. to `self_review`/`manager_check`/...), the card wrongly says "Entered (still to propagate)" while in reality there is nothing to propagate — every child is reviewer-locked.

## Root Cause

`getKpiStatus()` in `src/pages/admin/OrgKpiDataEntry.tsx` (lines 207-275) treats `OKV.status ∉ {propagated, approved}` as "Entered" without consulting child KPI state. `kraSetEmpIdsByKey` is consulted **only** when OKV.status is already `propagated/approved` (the "stuck" branch). The "everything advanced past kra_set already" case falls through to "Entered".

This stale-OKV state happens whenever:
- The KPI was propagated under an earlier flow that didn't flip `org_kpi_values.status`
- The OKV row was edited (saved as `draft`) after propagation completed
- A `sent_back` cycle reverted OKV to a non-propagated status while children kept moving

## Fix (UI-only, no schema change)

Make the card status **fact-based** by combining OKV state with real child-KPI advancement:

1. In `useOrgLevelKpisWithEmployees` (already gives us `kraSetEmpIdsByKey`), additionally return:
   - `mappedEmpIdsByKey` — set of all employee_ids mapped to each org KPI definition (already computed as `countMap`, just expose it)

   `kraSetEmpIds` ⊂ `mappedEmpIds`. So `mappedEmpIds.size - kraSetEmpIds.size = #children already advanced`.

2. Rewrite `getKpiStatus` decision tree (employee scope shown; mirror for department/org):

   ```
   hasOkv?  →  no  → 'pending'
            →  yes →
              allMappedAdvancedPastKraSet =
                kraSetEmpIds.size === 0 && mappedEmpIds.size > 0

              if okv.status ∈ {propagated, approved}:
                stuck if any kra_set child remains  → existing logic
              else (okv.status is draft / sent_back / …):
                if allMappedAdvancedPastKraSet:
                  // Children already moved on. Nothing to propagate. Treat as Propagated.
                  return 'propagated'   // optionally a new 'locked' chip
                else:
                  return 'entered'      // genuine pending re-push
   ```

3. Tooltip on the chip when this fallback fires: "OKV row is `<status>` but all mapped employees have already advanced past data-owner stage — nothing left to propagate."

4. Optional, low-risk follow-up (separate, off by default flag): a one-shot reconciler in Data Repair that flips `org_kpi_values.status` to `propagated` for rows where every mapped child is past `kra_set`. Not required to fix the display; included only so future loads are consistent at the source. Audit log: `ORG_KPI_STATUS_RECONCILED`.

## Files to touch

- `src/hooks/useOrgLevelKpis.ts` — also return `mappedEmpIdsByKey` (already computed in `countMap`).
- `src/pages/admin/OrgKpiDataEntry.tsx` — extend `getKpiStatus`; add tooltip on chip; thread the new map through the existing memo deps and the per-card status block around line 1087.
- `src/test/orgKpiTileStatus.test.ts` (new) — cases: (a) OKV draft + all children advanced → propagated, (b) OKV draft + some children still kra_set → entered, (c) OKV propagated + kra_set child → stuck (regression), (d) OKV propagated + no kra_set → propagated (regression).
- `mem/features/admin/org-kpi-management-suite` — append clause (16): "Tile status MUST be derived from OKV.status combined with real child kpis.status; OKV.status alone is insufficient."
- `docs/adr/ADR-055.md` — "Fact-based Org KPI tile status".
- `CHANGELOG_2026.md` — entry.

## Risk & Impact Report

- **Data Impact:** none. Read-only display change. Optional reconciler is opt-in and audit-logged.
- **Workflow Impact:** none. Propagate button continues to call the same RPC; preview output unchanged.
- **UI/UX Consistency:** chip semantics get sharper — KPIs that were misleadingly "Entered" will now correctly show "Propagated" with a tooltip explaining why.
- **Regression Risk:** low. The new branch is only entered when `OKV.status ∉ {propagated, approved}` AND `kraSetEmpIds.size === 0 && mappedEmpIds.size > 0`. All existing branches are preserved verbatim.
- **Mitigation:** unit tests above; manual QA on (a) Budget saving (the reported case), (b) any KPI with `sent_back` OKV but partial advancement (must still show Entered).

## Out of scope (intentionally)

- Changing `propagate_org_kpi_value` semantics — already correct.
- Editing `review_submissions` snapshots — POLICY §88 immutability.
- Backfilling historical OKV.status in bulk — covered by optional reconciler only if you ask for it.
