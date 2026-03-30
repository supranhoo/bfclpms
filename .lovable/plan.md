

## Plan: Previous Month Tiles in Review Journey (Real-Time Linked)

### What We're Building
Add a collapsible "Previous Months" section below the current Review Journey tiles. It fetches the **same KPI** (matched by `employee_id + kpi_name + kra_name + category_id`) for the previous 2 months directly from the database, showing all review stage cards with scores, ratings, remarks, and evidence — linked to live data with no gap.

### Layout

```text
┌─ Review Journey ──────────────────────── [PDF] ─┐
│  [Self] [Manager] [Auditor] [Mgmt]  ← Current   │
│                                                   │
│  ▼ Previous Months                                │
│  ┌─ February 2025 ─────────────────────────────┐  │
│  │ [Self] [Manager] [Auditor] [Mgmt]           │  │
│  └──────────────────────────────────────────────┘  │
│  ┌─ January 2025 ──────────────────────────────┐   │
│  │ [Self] [Manager] [Auditor] [Mgmt]           │   │
│  └──────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────┘
```

### Implementation

| File | Change |
|------|--------|
| `src/components/review/KpiJourneySection.tsx` | Add previous months section after the current stage grid |
| `DOCUMENTATION.md` | Version history v2.15.0 |
| `POLICY.md` | §32: Review Journey previous month comparison invariant |

### Key Logic in `KpiJourneySection.tsx`

1. **Compute previous 2 periods** from `kpi.review_period` / `kpi.review_year`:
   - Use MONTHS array index, decrement, handle year rollover (Jan → Dec of prev year)

2. **Fetch matching KPIs + submissions** via a single `useQuery`:
   - Query `kpis` table: `employee_id = X AND kpi_name = Y AND kra_name = Z AND category_id = C AND review_period IN (prev1, prev2) AND review_year IN (year1, year2)`
   - Join with `review_submissions` via separate query on returned KPI IDs
   - Also fetch each previous KPI's workflow via `get_bulk_employee_workflows` RPC for correct stage visibility
   - `staleTime: 2 * 60 * 1000` — real-time enough, avoids excessive refetches

3. **Render** inside a `Collapsible` (from shadcn), collapsed by default:
   - For each previous month: month/year header badge + same `ReviewStageCard` grid
   - Reuse existing `buildStage`, `getStageStatus`, `getVisibleStagesForLevel` functions
   - Each card shows scores, ratings, remarks, evidence — identical to current month tiles

4. **PDF export**: Include previous month data in the PDF when expanded (extend `ReviewTimelinePdfData`)

### Data Flow
- All data comes from live DB queries (same `kpis` + `review_submissions` tables as current month)
- No caching gap — uses React Query with short staleTime
- If no previous month data exists, section is hidden entirely

### Risk Assessment
- **Regression**: Zero — additive section below existing tiles
- **Performance**: 1 additional query (max 2 KPIs + 2 submissions); negligible
- **Workflow awareness**: Each previous month may have different workflow config; handled by per-period RPC call

