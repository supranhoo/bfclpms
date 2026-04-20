

## RCA — "Sanjeeb 101178 not visible in HR PMS" (March 2026)

### Evidence gathered

| Check | Result |
|---|---|
| Sanjeeb exists, is_active, portal_access | ✅ true / true |
| Workflow for March 2026 | ✅ `[kra_set, self_review, manager_check, skip_level_check, hr_pms_review, approved]` |
| KPIs in March 2026 | ✅ 23 at `hr_pms_review`, 3 at `self_review`, 1 at `kra_set` |
| HR PMS pool overall (March, status=`hr_pms_review`) | Only **2 employees** have any KPI at `hr_pms_review` for March — Sanjeeb (23) and one other (5) |
| Total March KPIs in DB | 1,758 |
| `get_bulk_employee_workflows(2533 IDs, 'March', 2026)` server-side | Returns 2,533 rows (works fine) |
| Current user role | Admin → RLS allows everything |
| Screenshot stat cards (Mar 2026, search "101178") | **Total Employees 0, Pending 0, In HR PMS 0, Reviewed 0, Total KPIs 0** |

### Root cause — TWO compounding issues

**Issue A: HR PMS panel is silently empty when the bulk-workflow RPC fails.** In `useProfilesByWorkflowStage` (lines 346–356), if the RPC errors (e.g., 90KB+ POST body of 2,533 UUIDs gets blocked by a proxy, RLS hiccup, or transient timeout), the catch falls back to the **default workflow template stages**. The system default = `[kra_set, self_review, manager_check, audit, management_review, approved]` — which **does NOT contain `hr_pms_review`**. The fallback then returns `[]`, wiping the entire HR PMS pool. There is no toast, no banner, no log surfaced to the user — just an empty panel.

**Issue B: The fallback doesn't try the actual HR PMS template** (or any non-default template that contains the requested stage). It only checks `is_default = true`, even though many orgs have multiple active templates. So even if the default fallback path triggers cleanly, anyone whose template differs from default (which is the entire HR PMS / Skip-Level cohort) becomes invisible.

**Why v2.64.8 didn't fix this:** v2.64.8 changed sort order. The bug now is not "Sanjeeb is on page 80" — it's "Sanjeeb is excluded from `baseMembers` entirely" in any session where the bulk RPC call fails or any HR-PMS employee uses a non-default template. The v2.64.8 stat-card recompute correctly shows `0` because `demographicFilteredMembers` is empty.

### Why it intermittently looks fine
On a fast network with successful RPC, all 2,533 profiles get their actual stages and Sanjeeb's `[..., hr_pms_review, approved]` matches the filter → he appears. On the failure path (or in production where the request body is large enough to be slow/blocked), the fallback wipes him.

---

## Proposed Fix

### Fix 1 — Make the RPC call resilient to large payloads (chunk it)
In `useProfilesByWorkflowStage`, batch the 2,533 IDs into chunks of 500 and call `get_bulk_employee_workflows` per chunk in parallel, merging results. Eliminates large-payload failures and keeps the cache key stable.

```ts
const CHUNK = 500;
const chunks: string[][] = [];
for (let i = 0; i < profileIds.length; i += CHUNK) {
  chunks.push(profileIds.slice(i, i + CHUNK));
}
const results = await Promise.all(
  chunks.map(ids => supabase.rpc('get_bulk_employee_workflows', { 
    employee_ids: ids, p_review_period: reviewPeriod, p_review_year: reviewYear 
  }))
);
// Merge into stagesMap; if ANY chunk errors, surface error not silent fallback.
```

### Fix 2 — Smarter fallback that respects requested stage
Replace the silent "default template only" fallback with a resilient one:
1. Per-chunk retry once (200ms backoff).
2. If still failing, fetch ALL active workflow templates and union their stages — include any employee whose `pms_grade` / `department_id` maps to a template that contains the stage.
3. As a last resort (only on total failure), surface a non-blocking toast: *"HR PMS roster is loading from a fallback source — refresh if employees appear missing"*. Never return `[]` silently.

### Fix 3 — Visibility into pool resolution (debug + telemetry)
Add a one-line console/log breadcrumb in `useProfilesByWorkflowStage` that prints `{ stage, totalProfiles, withStage, fallbackUsed }` (gated to non-prod or admin-only console). Also surface a tiny "X employees eligible / Y total" hint above the grid for full-access roles so empty states are diagnosable instantly:

```text
HR PMS Review · 2 employees with KPIs at this stage in Mar 2026 (of 2,533 eligible)
```

### Fix 4 — Stage-presence pre-check (defensive)
Before applying the workflow filter, run a tiny `SELECT DISTINCT employee_id FROM kpis WHERE status = 'hr_pms_review' AND review_period = 'March' AND review_year = 2026` to seed the visible set with employees who **demonstrably** have KPIs at the panel stage in this period. This guarantees Sanjeeb is in the pool regardless of workflow-resolution accuracy. The workflow filter is then layered on top as a sort/categorization aid, not a gate.

---

## Files Touched

| File | Change |
|---|---|
| `src/hooks/useOrganization.ts` | Chunked RPC calls; resilient fallback with per-chunk retry; diagnostic breadcrumb; **always** include employees who have KPIs at the requested stage in the requested period (Fix 4 seed) |
| `src/components/review/EmployeeSelectorGrid.tsx` | Small "N eligible of M total" diagnostic line above the grid for admin/HR PMS/auditor/management; non-blocking toast when fallback is used |
| `DOCUMENTATION.md` | Version History v2.64.9 — Resilient HR PMS / Audit / Management roster resolution |
| `mem://features/review/period-specific-reviewer-visibility` | Append: "Roster resolution must seed from `kpis(status, period)` actuals so reviewer panels never silently exclude employees on RPC fallback. Bulk RPC chunked at 500 IDs." |

No DB / RLS / migration / workflow changes. Pure client-side resilience.

---

## Risk & Impact

| Area | Impact |
|---|---|
| Data | None — read-only resolution |
| Workflow / RLS | None |
| UI | Adds one diagnostic line above grid for power users; non-blocking toast on fallback use only |
| Performance | Chunking sends 5 parallel RPC calls instead of 1 monster — actually faster for large orgs; 500-row chunks comfortably fit standard payload limits |
| Regression | Low. Output is a superset of v2.64.8 (anyone visible before stays visible; previously-hidden employees with KPIs at the stage now appear). Sort/badges unchanged. |
| Mitigation / test matrix | (a) HR PMS / Mar 2026 → Sanjeeb 101178 visible on page 1 with "23 in HR PMS Review" badge. (b) Audit / Mar 2026 → same workflow path validates. (c) Force-fail RPC (devtools network throttle) → toast appears, employees with March `hr_pms_review` KPIs still visible via Fix 4 seed. (d) Search "101178" in HR PMS → 1 result. (e) Diagnostic line shows "2 of 2,533" for HR PMS / Mar to confirm pool size matches DB. |

## Out of Scope
- Server-side pagination of the reviewer grid
- Refactoring the workflow resolution RPC itself
- Changing v2.64.8 sort logic (it was correct; the bug was upstream in roster resolution)
- Adding monitoring/alerting infrastructure for RPC failures

