## What I verified first (facts, not assumptions)

Database (live queries):
- Brundaban Chandra Das (102028) → `functional_manager_id` = V.A.V.S.S. Ganapathi Varma (200271); `reporting_manager_id` = Sajid Raza (100264), whose manager is Gaurav Budhia. So Ganapathi is **only** a functional manager for him — not direct, not skip.
- Ganapathi has exactly one role: `manager` (i.e. NOT full-access).
- June 2026: 20 KPIs at status `manager_check`. `fm_pending_status_for_kpi` = `manager_check` for those rows, so the FM stage exists in his resolved workflow and the FM is the pending actor.
- RLS is already correct: `FM can update KPI status on FM stage` (USING `is_fm_actionable_kpi(id)`), plus matching update/insert policies on `review_submissions`, and SELECT/INSERT policies on observations/queries. `is_fm_actionable_kpi` returns false in my SQL session only because `auth.uid()` is NULL there — that is expected, not a defect.

Client (code reads):
- `UnifiedScorecard` has the `functional_manager` level with prefix `functional_manager` and previous score `manager_score`; `KpiDetailsTable` / `MobileKpiCard` accept `functional-manager-review`; `workflowEngine` resolves the FM reviewable status as the stage preceding `functional_manager_check`.
- `get_manager_team_roster` returns a `functional` relationship row, and the non-full-access Team branch of `EmployeeSelectorGrid` uses it.

**Conclusion on the reported symptom:** for Ganapathi's own login the happy path is now wired end to end; the read-only screenshot matches the pre-fix build. What is *not* yet closed are the real remaining gaps below, which still produce a read-only FM view on other entry paths.

## Confirmed remaining gaps

1. **Full-access viewers mis-tag the relationship.** In `EmployeeSelectorGrid`, the `isFullAccess` Team branch tags only `direct` / `indirect`; a functional report falls through as `undefined`. Admin/HR/Management assisting an FM therefore land on the Manager view (read-only at `manager_check`).
2. **Deep-link / direct-open path is unreliable.** `resolveRelationship` in `Dashboard.tsx` decides "functional" by reading `employee.functional_manager_id`, a field the roster payloads do not always carry; it then silently defaults to `relationship: 'direct'`, which is exactly the read-only manager view.
3. **No FM signal in the stage strip / tiles.** The grid computes `functionalIdSet` but the header tiles only expose direct/skip counts, so an FM sees "Functional Mgr 0" with no pending tile.
4. **No live proof.** Existing tests (`functionalManagerScorecardLevel.test.ts`, `functionalManagerPendingWith.test.ts`) are pure-logic; nothing asserts the RLS write actually succeeds.

## Plan

### Phase D1 — Relationship resolution SSOT (client)
- Add `src/lib/review/resolveReviewerRelationship.ts`: single pure function taking `{ viewerId, employee: { reporting_manager_id, functional_manager_id }, directIds, skipIds, functionalIds }` → `'direct' | 'indirect' | 'functional' | 'other'`, with **functional evaluated before the `direct` fallback**.
- `EmployeeSelectorGrid`: use it in **both** Team branches, so full-access viewers also tag `functional` (source: `functionalIdSet`, plus a `functional_manager_id === viewerId` check on the profile row).
- `Dashboard.tsx`: replace the ad-hoc chain in `resolveRelationship` with the same helper; when the field is absent, do one targeted `profiles` read of `functional_manager_id` for that employee instead of defaulting to `direct`.

### Phase D2 — FM visibility in Team Reviews
- Surface a "Functional" tile/filter chip beside Direct / Skip-Level, driven by `functionalIdSet`, with pending counts computed from `resolveReviewableStatuses('functional_manager', stages)` (the counting logic already exists in `getEmployeeKpiStats`).
- Employee cards keep the existing `functional` badge.

### Phase D3 — Guardrail against silent read-only
- In `UnifiedScorecard`, when the viewer is a mapped FM for the employee and the KPI's status equals the FM-pending stage but the resolved view level is not `functional_manager`, render an explicit inline notice ("You are the Functional Manager for this employee — reopen from Team → Functional") rather than a silent read-only grid. This turns any future mis-routing into a visible, diagnosable state.

### Phase D4 — Test case and live verification
- Unit: `resolveReviewerRelationship` matrix (direct / indirect / functional / functional-when-also-indirect / unknown), including the full-access branch.
- Integration (vitest): given workflow `[…, manager_check, functional_manager_check, …]` and KPI status `manager_check`, assert view level `functional_manager`, `isReviewable === true`, and score field prefix `functional_manager`.
- Live: run a signed-in browser check against the preview with the real records — open Team → 102028 as the FM path, confirm the view header reads "Functional Manager Review", the score inputs are editable, and a save writes `functional_manager_score` to `review_submissions`. Report the observed result before declaring closure.

### Phase D5 — Documentation and policy
- `docs/adr/ADR-206.md`: record RCA (relationship resolution, not RLS), the SSOT helper, and the guardrail.
- `POLICY.md §WF-FM-RELATIONSHIP-SSOT`: relationship tagging must come from one resolver; no reviewer path may default an untagged employee to `direct`.
- Version History entry.

## Risk and impact

- **Data:** none. No schema or RLS change — server side is already correct and verified.
- **Workflow:** additive only; direct/skip/full-access routing is unchanged except that functional is now checked before the `direct` fallback.
- **UI:** one new tile/chip in Team Reviews; one new inline notice that appears only in the mis-routing case.
- **Regression risk:** medium-low, concentrated in `EmployeeSelectorGrid` roster memoisation — mitigated by the relationship matrix unit test and the existing team-roster gate tests.
- **Rollback:** revert the helper and its three call sites; no migration to undo.
