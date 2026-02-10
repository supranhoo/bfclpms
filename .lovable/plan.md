

# Fix Import Issues: auditRemarks, Employee Code Matching, and Rating Preservation

## Issue 1: auditRemarks Being Removed

**Root Cause:** The `auditRemarks` mapping and storage logic exists, but there's a potential header mismatch issue. The `normalizeKpiRow` function maps the column correctly (line 539), but the edge function's sanitization step (line 193) conditionally includes it only when truthy. If the value is whitespace-only or has an unexpected format, it gets silently dropped.

**Fix:** Add defensive handling in the edge function to ensure `auditRemarks` (and `managerRemarks`, `employeeRemarks`) are never silently dropped. Also add broader column name aliases to catch more header variations (e.g., `Audit_Remarks`, `auditor_remarks`, `Auditor Remarks`).

---

## Issue 2: Employee Code Changed (100360 to 101114) -- Name Fallback Bug

**Root Cause:** Both the foreground import (line 829-832) and the background import edge function (line 482) use a **name-based fallback** when the employee code doesn't match. This means if employee "Komal Bansal" exists with code `101114`, and the Excel file has code `100360` for "Komal Bansal", the system matches by name and silently links the KPI to employee `101114` instead of respecting the uploaded code `100360`.

**Fix:** Remove the name-based fallback from employee matching in both import paths. Match employees **exclusively by `employee_code`**. If the code doesn't match any existing employee, treat it as a missing employee (create new or report error) -- never silently substitute a different employee based on name.

Changes:
- **Edge function** (`import-kpis/index.ts`, lines 478-493): Remove `employeeByName` fallback from the missing-employee detection and from the KPI assignment (line 675).
- **Frontend foreground** (`ImportData.tsx`, lines 829-832): Remove the `full_name` fallback matching. Match only by `employee_code`.

---

## Issue 3: Imported Ratings Being Changed

**Root Cause:** The import logic does NOT preserve explicitly provided ratings as-is. In the edge function (lines 847-864), when building `review_submissions`, the code computes `final_score` using a cascade:

```
final_score: row.auditRating || row.managerRating || row.employeeRating || row.rating || null
```

This JavaScript `||` operator treats `0` as falsy, so a legitimate rating of `0` gets skipped. Additionally, the `self_score`, `manager_score`, and `auditor_score` fields may get recalculated instead of using the explicitly provided values.

The same issue exists in the foreground import (lines 1063-1078).

**Fix:** When a rating value is explicitly provided in the uploaded file (not null/undefined), use it as-is without modification. Only calculate/infer ratings when they are genuinely absent. Use explicit null checks (`!== null && !== undefined`) instead of truthy checks (`||`) to preserve zero ratings.

Changes in both import paths:
- Use `row.rating ?? null` instead of `row.rating || null`
- Use `row.auditRating ?? row.managerRating ?? row.employeeRating ?? row.rating ?? null` for `final_score`
- Apply the same pattern for `self_score`, `manager_score`, `auditor_score`

---

## Technical Summary of File Changes

### `supabase/functions/import-kpis/index.ts`
1. Remove `employeeByName` map and all name-based fallback matching
2. Fix `||` to `??` for all rating/score fields in submission records
3. Ensure `auditRemarks` is never silently dropped

### `src/pages/admin/ImportData.tsx`
1. Remove name-based employee matching fallback (lines 829-832)
2. Fix `||` to `??` for rating/score preservation in foreground submissions (lines 1063-1078)

### `DOCUMENTATION.md`
Update import behavior notes:
- Employee matching is by `employee_code` only (no name fallback)
- Imported ratings are preserved exactly as provided
