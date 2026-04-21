

## RCA — "Value Entered" badge persists despite all visible employees being propagated

### Confirmed root cause
The KPI "Enhance Campaign life of 1050 TPD" (March 2026) has **5 employee-scoped rows** in `org_kpi_values`, but the card only shows **3 employees** (Devendra, Subhransu, Sudhakar — all `propagated`).

The two extra rows are stale assignment ghosts:

| Employee | Status | Updated | Visible in card? |
|---|---|---|---|
| Devendra Kumar Yadav | propagated | 12:33 today | ✓ |
| Subhransu Sekhar Nayak | propagated | 12:33 today | ✓ |
| Sudhakar Kumar Pandey | propagated | 12:33 today | ✓ |
| **Biswanatha Mahanta** | **entered** | 07:23 today | ✗ (no longer assigned) |
| Sajid Raza | approved | Apr 5 (prior) | ✗ |

`getKpiStatus` (lines 192–209 of `src/pages/admin/OrgKpiDataEntry.tsx`) requires **every** matched row to be `propagated`/`approved`. Biswanatha's `entered` row — for someone who is not currently in the card's scoped employee list — drags the pill back to "Value Entered".

The v2.65.3 scope-aware filter only excludes rows with `employee_id='null'`. It does **not** exclude employee rows that are no longer in the KPI's current assignment set. That gap is the bug.

### Why the orphan row exists
Biswanatha was likely an assigned scoped employee for this KPI earlier today, then removed from the scope after data was saved. The `org_kpi_values` row was not deleted (matches existing policy — historical data is preserved). The badge logic must therefore be the place that ignores it.

### Assumptions stated explicitly
1. The fix belongs in `getKpiStatus`, not in DB cleanup. Historical rows are intentionally preserved.
2. The card's currently-displayed scoped employee list is the source of truth for "who counts" toward the badge. I will use the same `scopedEmployeeIds` set the card already computes from `org_kpi_data_owners` / scope assignments.
3. No schema, RLS, or RPC change.

### Alternatives considered and rejected
- **Delete orphan `org_kpi_values` rows when scope changes.** Rejected — silent historical data loss.
- **Mark orphan rows as `propagated` automatically.** Rejected — fabricates state.
- **Match by row `updated_at` recency.** Rejected — brittle and wrong semantics.

---

## Plan — minimum-code fix

### Single change in `src/pages/admin/OrgKpiDataEntry.tsx`
Inside `getKpiStatus`, after the existing `null`-filter, add one more filter step: only count rows whose `employee_id` (or `department_id` for department scope) is in the KPI's **current** scoped-id set.

The card already computes the current scoped employee/department ids per KPI to render the rows. I will lift/reuse that computation (via the same hook/util the card uses — `useOrgKpiScopedAssignments` or equivalent) and pass the set into `getKpiStatus` via a `Map<kpiKey, Set<string>>`.

Estimated: ~10 lines in `OrgKpiDataEntry.tsx`, no other files.

### Files touched
| File | Change |
|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Build `currentScopedIdsByKpi: Map<kpiKey, Set<string>>` from existing scope data; in `getKpiStatus` filter `matching` to rows whose `employee_id`/`department_id` is in that set. |
| `DOCUMENTATION.md` | Append v2.65.5: badge ignores orphan rows for employees/departments no longer in the KPI's current scope. |

### Out of scope
- No DB cleanup of orphan `org_kpi_values` rows.
- No change to save/propagate handlers.
- No change to org-scope branch (lines 184–191), already correct.
- No new abstractions, no tests beyond the v2.65.3 baseline (this is a 1-condition tightening of an existing filter).

### Risk & Impact
- **Data:** none — read-only badge logic.
- **Workflow:** none — propagate already worked.
- **UI/UX:** badge will now correctly show **Propagated** when all currently-scoped employees are propagated, ignoring rows for unassigned/historical employees. Affects all employee/department-scoped Org KPIs where membership has changed mid-period (positive impact).
- **Regression risk:** low. Org-scope branch untouched. Employee/department branch only narrows further.
- **Mitigation:** reuse the exact scoped-id source the card itself uses to render rows, so badge state and visible rows stay in sync by construction.

### Why this is the simplest correct fix
- One filter step in one function.
- Uses data the page already has.
- No DB changes, no data migration, no new abstractions.
- A senior engineer would call this a one-line semantic fix: "match the badge to what the card actually shows."

