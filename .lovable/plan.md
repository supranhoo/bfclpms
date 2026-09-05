# Default to Previous Month in Team Reviews & Org KPI Data Entry

## Goal
When a user opens **Team Reviews** (dashboard team view) or **Org KPI Data Entry**, the period selector should default to the **previous month** instead of the current month, since teams always enter data for the month just ended. This prevents accidental entries against the current month.

## Current state (verified)
- **Team Reviews** (`src/pages/Dashboard.tsx`) gets its default from `useDefaultPeriodSelection()` in `src/components/ui/ReviewPeriodSelectorEnhanced.tsx` — returns `format(new Date(), 'MMMM')` (current month).
- **Org KPI Data Entry** (`src/pages/admin/OrgKpiDataEntry.tsx`) gets its default from `useReviewPeriodDefaults()` in `src/components/ui/ReviewPeriodSelector.tsx` — also returns the current month.
- `useReviewPeriodDefaults` is shared with Org KPI Overview, Org KPI Audit Review, and Audit Logs — those pages will **not** be changed unless you want the same default there too (open question below).
- Users can still switch to any month manually; URL `?period=&year=` deep links already override the default, so shared links keep working.

## Changes
1. **Add one shared helper** `getPreviousMonthPeriod(date?: Date): { month: string; year: number }` in `src/lib/frequencyCycleOptions.ts` (or a small new `src/lib/previousPeriod.ts`) that returns the prior calendar month, handling the January → December-of-prior-year rollover.
2. **Team Reviews**: update `useDefaultPeriodSelection()` in `ReviewPeriodSelectorEnhanced.tsx` to use the helper (previous month, correct year). This hook is only consumed by Dashboard/Team Reviews, so blast radius is exactly the requested surface.
3. **Org KPI Data Entry**: in `OrgKpiDataEntry.tsx`, replace the current-month default with the helper — without touching the shared `useReviewPeriodDefaults` hook, so Audit Logs / Org KPI Overview / Audit Review keep current-month defaults. (Alternative: change the shared hook so all four pages default to last month — one line, but wider scope.)
4. **Docs/policy**: ADR-362 + `DOCUMENTATION.md` + `POLICY.md` entry (period-default convention: data-entry surfaces default to current month − 1; report/audit surfaces stay on current month).

## Edge cases
- **January**: default becomes December of the previous year (handled by the helper).
- Governance locks: if the previous month is locked, the existing lock/read-only UI already handles it — no new logic needed.
- Deep links (`?period=Sep&year=2026`) continue to win over the default.

## Tests
- Unit test for the helper: mid-year month, January rollover, and injected date (deterministic).
- Component test: Org KPI Data Entry renders with previous month pre-selected; Team Reviews period selector shows previous month.
- Existing period-override tests (URL params) must stay green.

## Open question
Should the same "previous month" default also apply to **Org KPI Overview** and **Org KPI Audit Review** (they share the hook)? Default answer in the plan: **no** — only the two requested surfaces change.
