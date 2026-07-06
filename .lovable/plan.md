## Root Cause

The KPI Mapping Matrix fetches KPIs from **two calendar years** (`filters.year` and `filters.year + 1`) and then adds every KPI to the fiscal-year grid purely by matching `review_period` to a month name — **without checking whether that month belongs to the currently-selected fiscal cycle**.

Concrete example (employee 101679 "Aakash Kumar Roy", fiscal 2025‑26):

| review_year | review_period | Belongs to fiscal | Currently rendered as |
|---|---|---|---|
| 2026 | July | 2026‑27 (Jul‑2026) | ✅ Jul of 2025‑26 ❌ wrong |
| 2026 | April | 2025‑26 (Apr‑2026) | ✅ Apr of 2025‑26 ✔ correct |
| 2026 | May | 2025‑26 | ✅ May 2025‑26 ✔ |
| 2026 | June | 2025‑26 | ✅ Jun 2025‑26 ✔ |

The employee has **no** July/Aug/Sep 2025 KPIs, yet the matrix ticks **Jul** and labels **First Mapped = Jul** because it borrowed the July‑2026 row from the next fiscal cycle. The same defect will apply to any Aug/Sep/Oct/Nov/Dec KPI incorrectly carried over from an adjacent fiscal year, and to Quarterly/Half‑yearly/Annual KPIs whose cycles straddle the boundary.

## Fix

Correct the fiscal boundary in `useKpiMappingMatrix` (`src/hooks/useAdminReports.ts`) so a KPI is only counted when its `(review_year, review_period)` actually falls inside the selected fiscal window `Jul <year> – Jun <year+1>`:

1. **Filter monthly KPIs by fiscal window.** When mapping `review_period` (a month name) to a fiscal‑month cell:
   - Months July–December → only accept rows whose `review_year = filters.year`.
   - Months January–June → only accept rows whose `review_year = filters.year + 1`.
   Rows outside this window are ignored.
2. **Filter non‑monthly KPIs by fiscal window.** After `getCalendarMonthsForPeriod(...)` resolves the covered calendar months, drop any month that does not belong to the selected fiscal cycle (apply the same Jul–Dec vs Jan–Jun year check against the KPI's `review_year`).
3. **Recompute `firstMappedMonth`** from the filtered month set (already derived from `monthsObj`, so this is automatic once step 1 & 2 are correct).
4. **Keep the two‑year fetch** (still needed because a single fiscal cycle spans two calendar years), but tag each fetched row with its `review_year` so the filter above can run.

No schema changes. No RLS changes. Only the client‑side aggregation in `useAdminReports.ts` is touched.

## Verification

- Re‑query employee `101679` on fiscal 2025‑26 after the fix — expected: **First Mapped = Apr**, only Apr/May/Jun ticked (Jul–Mar all ✗).
- Add a Vitest for `useKpiMappingMatrix` covering: (a) `review_year=2026, review_period=July` MUST NOT appear in fiscal 2025‑26; (b) `review_year=2026, review_period=April` MUST appear in fiscal 2025‑26; (c) an Annual KPI whose cycle straddles years only contributes months that fall in the selected fiscal window.
- Sanity‑check summary tiles (Total / Mapped / Coverage %) unchanged in scale — Total stays the full active roster; Mapped may legitimately drop because previously‑miscounted employees now show 0 months.

## Docs

- `DOCUMENTATION.md` → note the fiscal‑window guard in the KPI Mapping Matrix section.
- `POLICY.md` → add: "KPI Mapping Matrix counts a KPI in fiscal `Y` only when `(review_year, review_period)` lies inside `Jul Y – Jun Y+1`. Rows from adjacent fiscal cycles MUST NOT bleed across the boundary."

## Out of scope

- No change to the "First Mapped" semantic (still = earliest **covered review month** in the selected fiscal cycle, not `kpis.created_at`). If you'd rather it mean "date the mapping was first created in the system", that's a separate change — say the word and I'll fold it in.
