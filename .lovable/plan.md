

## Add Month-Year Filter to Pending Self-Reviews Page

### What
Add a month/year selector to the Pending Self-Reviews admin page so the admin can filter overdue KPIs by a specific review period instead of seeing all overdue KPIs across all months.

### Changes

**Modified: `src/pages/admin/PendingSelfReviews.tsx`**
- Import `EffectiveMonthSelector` (already exists at `src/components/admin/EffectiveMonthSelector.tsx`)
- Add `selectedMonth` and `selectedYear` state (defaulting to previous month and its year)
- Place the selector between the Settings card and the Tabs
- Pass `selectedMonth` and `selectedYear` to both hooks so data is filtered client-side

**Modified: `src/hooks/usePendingSelfReviews.ts`**
- Add optional `filterMonth` and `filterYear` parameters to `useOverdueKraSetKpis` and `useOverdueTeamReviewKpis`
- Add `.eq('review_period', filterMonth).eq('review_year', filterYear)` to the Supabase queries when provided, reducing data fetched
- Include filter values in query keys for proper cache invalidation

### UI Layout
```text
┌─ Pending Reviews ──────────────────────────────┐
│ ⚙ Settings [...]                               │
│                                                 │
│ 📅 Effective Month: [February ▼]  Year: [2026 ▼]│
│                                                 │
│ Tab 1: Pending Self-Review (3)                  │
│ Tab 2: Pending Manager Review (5)               │
└─────────────────────────────────────────────────┘
```

### No database changes needed

