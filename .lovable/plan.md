

## Add Terminal Month Status Banner for Non-Terminal Sibling KPIs

### Problem
When viewing a non-terminal month of a multi-month KPI (Quarterly, Bi-Monthly, Half-Yearly, Yearly), there is no indication that data has been entered in the terminal month and is progressing through the review workflow. Users see an empty Review Journey with no context. Per ADR-047, scores only percolate to siblings once the terminal month reaches `approved` status.

### Target UI

```text
┌─────────────────────────────────────────────────────────────────────┐
│ ⏳ Review Journey                                            ↓ PDF │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 📅  This is a Quarterly KPI. Data was entered in the terminal  │ │
│ │     month (March 2026) and is currently at Manager Review.     │ │
│ │     Scores will appear here once the terminal month is         │ │
│ │     approved.                                                  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                            │
│  │  Self   │  │ Manager │  │ Auditor │  ... (stages as usual)      │
│  │ Pending │  │ Pending │  │ Pending │                             │
│  └─────────┘  └─────────┘  └─────────┘                            │
└─────────────────────────────────────────────────────────────────────┘

States:
─────────────────────────────────────────────────────────────────────
1. Terminal month has submission but NOT approved:
   "Data entered in March 2026 — currently at [Manager Review].
    Scores will appear here once approved."
   (Blue info banner with CalendarClock icon)

2. Terminal month is at kra_set (no data yet):
   "This is a Quarterly KPI. Data entry happens in the terminal
    month (March 2026). No data entered yet."
   (Muted/gray info banner)

3. Terminal month is approved (scores already percolated):
   No banner needed — scores are visible in the stage cards.
```

### Solution
Add a banner inside `KpiJourneySection.tsx` that:
1. Checks if the current KPI's period is a **non-terminal** (locked) month using `isKpiLockedForPeriod()`
2. If locked, resolves the **terminal month** using `getActiveMonthForCycle()`
3. Fetches the terminal month's KPI record (same employee, KRA, KPI name, category) to get its `status` and check if a submission exists
4. Renders an informational `Alert` banner between the header and the stage cards

### Changes

**File: `src/components/review/KpiJourneySection.tsx`**
1. Import `isKpiLockedForPeriod` and `getActiveMonthForCycle` from `frequencyUtils`
2. Add a `useQuery` hook to fetch the terminal month's KPI when the current month is locked:
   - Query: `kpis` table filtered by `employee_id`, `kra_name`, `kpi_name`, `category_id`, terminal month, same year
   - Also fetch its `review_submissions` row to check if data exists
3. Render a contextual `Alert` banner:
   - **Data entered, pending review**: Blue banner with terminal month status label (from `statusLabels`)
   - **No data yet**: Gray/muted banner stating data entry happens in terminal month
   - **Already approved**: No banner (scores are percolated)

**File: `src/lib/frequencyUtils.ts`**
- No changes needed — existing `isKpiLockedForPeriod` and `getActiveMonthForCycle` provide all required logic

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: None — read-only query for the terminal month's KPI
- **Regression risk**: None — additive UI banner, no existing logic modified
- **Performance**: Single lightweight query only for non-terminal multi-month KPIs; cached via React Query

