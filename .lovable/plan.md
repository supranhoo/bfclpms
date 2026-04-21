

## RCA — Why "KPI Scorecard Detail" shows >30 pending KPIs for Biswajit

### Confirmed: this IS a real Org KPI propagation bug, not a report misreading.

For Biswajit Sahoo as **data owner** (March 2026), the database shows:

| Bucket | Count |
|---|---|
| Owned org KPIs (distinct) | 55 |
| Total employee rows under those KPIs | 108 |
| Rows in `kpis.status = 'kra_set'` | 36 |
| ↳ of those, **half-propagated** (org_kpi_values has value + status `propagated`/`approved`, but NO `review_submissions` row and `kpis.status` still `kra_set`) | **29** |
| ↳ truly no data entered yet | 5 |
| ↳ has submission but stuck for other reasons | 2 |

**Concrete proof** — KPI "Handle all breakdowns…" / "Achieve organization's production target", March 2026, 6 assigned employees, all `org_kpi_values` rows updated within a 5-second window today (11:38:00–11:38:05):

| Employee | `kpis.status` | `org_kpi_values.status` | Has `review_submissions`? |
|---|---|---|---|
| Y R V S Murthy | `self_review` | propagated | ✓ |
| Shrikant Ganguly | `approved` | propagated | ✓ |
| **Monu Kumar Soni** | **kra_set** | propagated | ✗ |
| **Prabhat Kumar Singh** | **kra_set** | approved | ✗ |
| **Sanjay Kumar Dubey** | **kra_set** | approved | ✗ |
| **Sushanta Ghosh** | **kra_set** | approved | ✗ |

Same Propagate click. 4 of 6 silently fell through.

### Why this happens

`handleCardSaveAndPropagate` (`src/pages/admin/OrgKpiDataEntry.tsx`) iterates over `values.scopedValues` — the rows the **card currently shows** (from `mappedEmployeesMap`, sourced from `useOrgLevelKpisWithEmployees`). For each, it calls the propagate RPC with that one `employeeId`.

Inside the hook (`src/hooks/usePropagateOrgKpiValue.ts`, `fetchTargetKpis`), the call:
1. Selects `kpis` rows matching `(category_id, kra_name, kpi_name)` and `is_org_level=true`.
2. Filters down to `employee_id = employeeId`.
3. Sends `kpi_ratings` to the `propagate_org_kpi_value` RPC.

The RPC then `UPDATE kpis SET status='self_review' WHERE id=…`. Good for those rows.

**The gap:** if an employee has an `org_kpi_values` row but **no matching row in `kpis`** (e.g. KPI was retroactively reassigned, KPI name changed slightly via "Copy KRAs" / KRA library sync, or `is_org_level` flag was toggled off and on for some employees), the propagate loop never includes them, so neither `review_submissions` nor `kpis.status` is updated for that employee. Yet a separate code path (the `await supabase.from('org_kpi_values').update({status:'propagated'})` block at lines 671–680) bulk-updates **all** matching `org_kpi_values` rows for any `propagatedScopeIds` employee. That mass update is **scope-id-driven**, not `kpi_id`-driven, so it can flip `org_kpi_values.status` for an employee whose `kpis` row was never touched.

This is exactly the half-propagation we patched the dashboard for in v2.65.4 (display gating). The dashboard now hides the phantom value, but the **underlying state divergence still exists**, which is why the report still flags those rows as pending — because they truly are pending: `kpis.status = 'kra_set'`.

### Two things to fix

1. **Stop creating new half-propagations** (forward-fix, prevents recurrence).
2. **Repair the existing 29 half-propagated rows for Biswajit + the equivalent rows for all other owners across all periods** (one-time data backfill).

### Assumptions explicitly stated

- The RPC itself is fine — given a `kpi_id`, it correctly upserts `review_submissions` and advances `kpis.status`. The bug is upstream: which `kpi_id`s the caller sends.
- The card's "currently mapped employees" set (`mappedEmployeesMap`) is the source of truth for who SHOULD receive a propagate call. Any drift between that set and the actual `kpis` rows for that `(category, kra, kpi, period)` is the bug surface.
- Backfill should reuse the existing RPC (`propagate_org_kpi_value`) per-`kpi_id`, not invent new logic, so the audit trail stays consistent.

### Alternatives considered and rejected

- **Tighten the report to hide rows where `org_kpi_values.status='approved'`**. Rejected — that hides the real workflow gap from operators and contradicts v2.65.4's "honest display" policy.
- **Auto-advance `kpis.status` whenever `org_kpi_values.status='approved'`**. Rejected — fabricates submission data and violates submission-score-integrity policy.
- **Delete orphan `org_kpi_values` rows**. Rejected — destroys historical entry record.

---

## Plan — minimum-code fix in two parts

### Part 1 — Forward-fix: align the Propagate loop with all `kpis` rows that actually exist

Single change in `src/pages/admin/OrgKpiDataEntry.tsx` `handleCardSaveAndPropagate`:

After the existing scoped-values loop, do **one consistency check**: for every employee that has a `kpis` row for this `(category_id, kra_name, kpi_name, period, year, is_org_level=true)` but did **not** receive a propagate call (i.e. they were not in `values.scopedValues` because the card didn't render them), surface a clear warning toast listing the missed employees, and **do not** update their `org_kpi_values.status` to `propagated` (so the data state stays consistent with workflow state).

That stops new half-propagations. ~15 lines.

### Part 2 — One-time backfill via the existing Data Repair engine

Add one new repair workflow under `/admin/settings` → Data Repair (existing engine, see `mem://features/admin/data-repair-engine`):

- **"Repair Half-Propagated Org KPIs"**
  - Dry-run first: lists every `(kpi_id, employee_name, period)` where:
    - `kpis.status = 'kra_set'`
    - matching `org_kpi_values` row exists with `achieved_value` not null and `status IN ('propagated','approved')`
    - no `review_submissions` row exists for `kpi_id`
  - On confirm: for each row, calls the existing `propagate_org_kpi_value` RPC with the stored `achieved_value` to create the `review_submissions` row and advance `kpis.status` to `self_review`.
  - Audit trail: every backfilled `kpi_id` gets a `kpi_audit_logs` entry with `action='ORG_KPI_BACKFILL_PROPAGATION'`, `performed_by=admin`, source recorded.

This is a self-contained admin tool, fits the Data Repair pattern already in use. ~80 lines (UI dialog + handler + dry-run query).

### Files touched

| File | Change |
|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add post-loop consistency check; warn on missed employees; don't flip their `org_kpi_values.status`. |
| `src/pages/admin/AdminSettings.tsx` (or existing Data Repair component) | Add "Repair Half-Propagated Org KPIs" card with dry-run + confirm. |
| `src/hooks/useRepairHalfPropagatedOrgKpis.ts` (new) | Dry-run query + per-`kpi_id` repair loop calling existing RPC. |
| `DOCUMENTATION.md` | v2.65.6 — Half-propagation forward-guard + backfill tool. |
| `mem://features/admin/data-repair-engine` | Append new workflow. |

### Out of scope

- No change to `propagate_org_kpi_value` RPC.
- No change to RLS or schema.
- No change to the report — it is correct.
- No automated cron repair. Admin-triggered only.

### Risk & Impact

- **Data:** Backfill creates `review_submissions` rows from existing `org_kpi_values.achieved_value` and advances `kpis.status` from `kra_set` → `self_review`. Reversible via existing rollback mutation. Dry-run mandatory.
- **Workflow:** Affected employees will see their KPIs jump from "KRA Set" to "Self Review" with the propagated value pre-filled. Matches what they should have seen if the original Propagate hadn't half-failed.
- **UI/UX:** No visible change to Org KPI Data Entry page beyond a warning toast on incomplete propagations.
- **Regression risk:** low. Backfill reuses the production RPC. Forward-guard only narrows existing flow.
- **Mitigation:** dry-run preview lists every affected row by name; admin approves explicitly; rollback path exists.

### Why this is the simplest correct fix

- Forward-guard is one consistency check on existing data the page already has.
- Backfill reuses the production RPC — no new propagation logic.
- Report stays unchanged because the report was right all along.
- A senior engineer would call this "stop the bleeding + repair the wound, using tools already in the kit."

