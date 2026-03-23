

## Bugs Found in Direct Reportees — Score Trend

### Bug 1: Missing `hr_pms_score` and `skip_level_score` in fallback chain (Score Mismatch)

**Location**: Line 127

The monitor's score fallback is:
```
final_score → management_score → auditor_score → manager_score → self_score
```

The dashboard's `getScore()` (ManagementDashboard.tsx line 220-222) uses:
```
final_score → management_score → auditor_score → hr_pms_score → skip_level_score → manager_score → self_score
```

**Impact**: For any KPI where the highest-level score is `hr_pms_score` or `skip_level_score`, the monitor will skip it and fall through to `manager_score` or `self_score` instead — producing a different number than the dashboard. Also, these fields aren't even fetched in the select query (line 113).

**Fix**: Update the select to include `hr_pms_score, skip_level_score` and add them to the fallback chain in the same position as the dashboard.

---

### Bug 2: Dashboard `getScore` does NOT exclude N/A KPIs — but the monitor does

**Location**: ManagementDashboard.tsx line 217-224 vs Monitor line 126

The dashboard's `calculateMetrics` and `getScore` functions never check `is_na`. They don't even fetch `is_na` in the query (line 187). This means the dashboard includes N/A KPIs (with score 0) in its averages, while the monitor correctly skips them.

This is actually a **dashboard bug**, not a monitor bug. However, it means the two widgets will show different scores for the same employee when N/A KPIs exist. This is the inverse of the previous Jaspal bug — the monitor is now correct, but the dashboard's top/bottom performers and division averages include N/A KPIs with a 0 score.

**Fix**: Add `is_na` to the dashboard's KPI select and skip N/A KPIs in `getScore` (return null when `is_na === true`). This aligns both widgets.

---

### Bug 3: No pagination guard — `reporteeIds` can exceed Supabase `.in()` limit

**Location**: Line 116

If a manager (or selected manager) has more than ~300 direct reports, the `.in('employee_id', reporteeIds)` filter may fail or silently truncate. The KPI query also has no pagination (unlike the dashboard which batches in 1000-row chunks).

**Fix**: Batch the KPI query when `reporteeIds` exceeds 100 items, and add pagination similar to the dashboard's `while (hasMore)` loop.

---

### Bug 4: `review_submissions` is fetched as a single object but may be null

**Location**: Line 113, 125-127

The query uses `.select('... review_submissions (...)')` which returns `review_submissions` as a single object (not array) due to the 1-to-1 FK. If a KPI has no submission row, `kpi.review_submissions` will be `null`, and `s?.is_na` correctly short-circuits. However, `s?.final_score` will also be null, but the fallback chain will evaluate `null ?? null ?? null...` and correctly return null. **This is actually handled correctly** — not a bug.

---

### Bug 5: `activeMonths` depends on `data` but is not in `useMemo` deps

**Location**: Lines 156-158, 161-168

`activeMonths` is computed outside `useMemo` but used as a dependency inside the `useMemo` for `sortedData`. Since `activeMonths` is recalculated on every render (new array reference), this causes `sortedData` to recompute on every render, defeating memoization.

**Fix**: Wrap `activeMonths` in its own `useMemo`.

---

### Bug 6: Fiscal month-to-year mapping assumes Jul=6 as fiscal start — hardcoded

**Location**: Line 101-102

The mapping `monthIndex >= 6 ? fiscalStartYear : fiscalStartYear + 1` uses JS `indexOf` on the MONTHS_ALL array (Jan=0, Feb=1, ... Jul=6). This is correct for a Jul–Jun fiscal year. However, if the organization's fiscal year start month is configured differently (e.g., April–March), this will map months to wrong calendar years. The dashboard uses the same hardcoded logic, so they're at least consistent — but both are wrong if the org doesn't use Jul–Jun.

**Severity**: Low (consistent with dashboard, but worth noting).

---

### Summary of Required Fixes

| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| 1 | Missing `hr_pms_score` and `skip_level_score` | High — score mismatch | Add to select + fallback chain |
| 2 | Dashboard doesn't exclude N/A KPIs | Medium — inconsistency | Add `is_na` check to dashboard's `getScore` |
| 3 | No `.in()` batching for large teams | Low — edge case | Add batching for reporteeIds > 100 |
| 5 | `activeMonths` not memoized | Low — perf | Wrap in `useMemo` |
| 6 | Hardcoded fiscal year mapping | Low — config risk | Note for future |

### Changes

**File 1: `src/components/management/DirectReporteesMonitor.tsx`**
- Line 113: Add `hr_pms_score, skip_level_score` to `review_submissions` select
- Line 127: Update fallback chain to `final_score → management_score → auditor_score → hr_pms_score → skip_level_score → manager_score → self_score`
- Lines 156-158: Wrap `activeMonths` in `useMemo`
- Lines 109-119: Add batching for large `reporteeIds` arrays

**File 2: `src/pages/ManagementDashboard.tsx`**
- Line 187: Add `is_na` to the KPI select
- Line 217-223: Return `null` from `getScore` when `s.is_na === true`

