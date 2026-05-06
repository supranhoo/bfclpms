## Issue (from Ankan's screenshot)
After saving/propagating an org KPI mapped to 50 employees, a destructive toast fires:

> "50 employee KPI(s) skipped during propagation … Use Data Repair → Repair Orphaned Propagations"

Yet the 25 visible rows did get values written. The 25 hidden rows (RLS) never get propagated, and the toast misrepresents the situation.

## Root cause
1. **Per-scope propagate loop** in `OrgKpiDataEntry.tsx` (lines 666–698) iterates over `values.scopedValues`, which is built **only from the visible profiles** (`allProfiles.filter(...)`). Hidden employees are never sent to `propagate_org_kpi_value`, so 25 of 50 KPIs really are skipped.
2. **Half-propagation guard** (lines 753–786) then re-queries `kpis` directly (no profile join — it sees all 50), compares against `propagatedScopeIds` (25), and emits the alarming red toast for every hidden employee. The wording also points users at "Repair Orphaned Propagations" even when nothing is actually orphaned — those rows simply weren't attempted yet.
3. The `org_kpi_values.status='propagated'` write at lines 789–826 only updates rows whose `department_id` / `employee_id` is in `propagatedScopeIds`, so hidden employees are also left with stale status — feeding the next-time "Already past initial stage" misclassification.

## Fix plan (no UX redesign — just correctness)

### A. Propagate every mapped employee, not just the visible ones
For `scope === 'employee'`:
- After the visible-scope loop, fetch the **full mapped employee list** for this `(category_id, kra_name, kpi_name, period, year, is_org_level=true)` from `kpis` (we already do this in the guard).
- For each `employee_id` not yet in `propagatedScopeIds`, derive the value to send:
  - If the data owner entered a single org-wide value (rare here), reuse it.
  - Otherwise reuse the value already stored in `org_kpi_values` for that employee (the data owner saved it earlier via `bulkUpsert`, even when their profile row was hidden — `org_kpi_values` is FK-checked, not RLS-blocked for owners).
- Call `propagate.mutateAsync({ scope: 'employee', employeeId, ... , silent: true })` for those rows so they advance server-side. Aggregate the count into `totalPropagated`.
- The `propagate_org_kpi_value` RPC already runs `SECURITY DEFINER`, so it can advance KPIs whose profile rows are hidden from the owner.

### B. Replace the half-propagation toast with an accurate summary
- Remove the destructive "skipped during propagation / Repair Orphaned" toast.
- After step A, recompute `missed = mappedKpis − propagatedScopeIds`. If `missed.length === 0` (the new normal), say nothing extra. Only show a destructive toast if a true RPC failure leaves `missed > 0`, and word it as: *"N employee KPI(s) could not be advanced — please retry."* (no Data Repair pointer).

### C. Status update covers all propagated rows
- Change the `org_kpi_values` status update for `scope === 'employee'` to use the union of `propagatedScopeIds` (visible) **and** the just-advanced hidden IDs from step A, so all 50 rows flip to `propagated`.

### D. Tests
- `src/test/orgKpiPropagateHiddenProfiles.test.ts` — unit test that, given a payload with 25 visible + 25 hidden employee IDs and a stub RPC, verifies (i) every employee is sent to `propagate_org_kpi_value`, (ii) the misleading "skipped/Repair Orphaned" toast is no longer emitted on the happy path, (iii) status update covers all 50.
- Extend `orgKpiSaveOrphanGuard.test.ts` to assert the hidden rows are still saved through the existing FK-safe path.

### E. Docs
- ADR-061 ("Org KPI propagation parity for RLS-hidden employees") describing the bug, fix, and that the prior "Repair Orphaned Propagations" toast was a false alarm in this configuration.
- Update `mem://features/admin/org-kpi-management-suite` and `CHANGELOG_2026.md`.

## Out of scope
- Schema changes — not needed; RLS already lets data owners write `org_kpi_values` for hidden profiles, and the RPC already advances `kpis`/`review_submissions` server-side.
- UI redesign of the propagation preview dialog (already addressed in the previous turn).
