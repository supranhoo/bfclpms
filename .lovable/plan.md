## Goal
Fix the misleading "2 active filters" badge on Admin → All KRAs that shows on first load even though no filter looks applied.

## Root Cause (recap)
`AllKpis.tsx` counts every filter whose value isn't `'all'`. `selectedPeriod` and `selectedYear` default to the current month/year, so the badge starts at 2.

## Fix (Option 1 — neutral baseline)
Edit only `src/pages/admin/AllKpis.tsx`:

1. **Badge count** — exclude Period/Year from "active" when they equal the current month/year:
   ```ts
   const isPeriodActive = selectedPeriod !== currentMonth;
   const isYearActive = selectedYear !== currentYear;
   const activeFilterCount =
     (isPeriodActive ? 1 : 0) +
     (isYearActive ? 1 : 0) +
     (selectedManager !== 'all' ? 1 : 0) +
     (selectedDepartment !== 'all' ? 1 : 0) +
     (selectedDivision !== 'all' ? 1 : 0) +
     (searchQuery.trim() ? 1 : 0);
   ```
2. **Reset button** — reset Period to `currentMonth` and Year to `currentYear` (not `'all'`), so post-reset badge reads 0.
3. **"Active filters" chips row** (if present) — hide the Period/Year chips when they equal current month/year.

## Out of Scope
- KPI hooks, RLS, network/timeout issues (tracked separately).
- Other admin pages.
- No new components, no design changes beyond the badge math.

## Verification
- Fresh load → badge hidden / reads 0.
- Change Period to April → badge reads 1.
- Change Year to 2025 → badge reads 2.
- Click Reset → Period=May, Year=2026, badge hidden.
- Search "abc" → badge increments.

## Risk
Low. Pure UI counter logic in one file. No data, workflow, or schema impact. Rollback = revert file.

## Docs
Append one-liner to `DOCUMENTATION.md` Version History: *"All KRAs filter badge no longer counts default Period/Year as active."* No POLICY.md change.
