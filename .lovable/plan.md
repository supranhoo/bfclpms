

## Plan: Show Observation Count on All Dashboard KPI Rows (Clean, Non-Cluttered)

### Design Approach — Avoid Clutter

Instead of adding another separate badge next to status + query badge + audit icon, observations will use a **compact icon-only indicator** — a small dot-count next to an Eye icon, styled subtly in amber. It only renders when count > 0, uses minimal horizontal space, and visually groups with existing badges without adding visual noise.

### UI

```text
Desktop row — Status cell (current vs proposed):

BEFORE:
│ [Manager Check] [2 query]                    │

AFTER (only when observations exist):
│ [Manager Check] [2 query] 👁 3               │
                              ↑ small amber Eye icon + count
                              No extra badge chrome — just icon + number
```

Mobile card — below the status badge row:
```text
│ [Manager Check]  [1 query]  👁 2             │
```

The indicator uses `text-amber-600` with no border/background — lighter visual weight than the destructive query badge, preventing clutter.

### Changes

**`src/components/review/KpiDetailsTable.tsx`**
- Add optional prop: `observationCounts?: Map<string, number>`
- After query badge (line ~591), render compact indicator:
  ```tsx
  {obsCount > 0 && (
    <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400">
      <Eye className="h-3 w-3" />{obsCount}
    </span>
  )}
  ```

**`src/components/dashboard/MobileKpiCard.tsx`**
- Add optional prop: `observationCount?: number`
- Render same compact indicator in the status badge row

**`src/components/review/UnifiedScorecard.tsx`**
- Import `useObservationsByKpis`
- Extract KPI IDs, fetch batch observations
- Derive `observationCounts: Map<string, number>` (kpiId → count)
- Pass to `KpiDetailsTable` and `MobileKpiCard`

**`src/components/review/EmployeeScorecard.tsx`**
- Same pattern

**`src/components/review/AuditScorecard.tsx`**
- Same pattern

**`src/components/review/ManagementScorecard.tsx`**
- Same pattern

**`DOCUMENTATION.md`** — v2.15.15 changelog

**`POLICY.md`** — Add invariant: observation counts visible on all dashboard KPI rows

### Files Modified

| File | Change |
|------|--------|
| `src/components/review/KpiDetailsTable.tsx` | Add `observationCounts` prop, render icon+count |
| `src/components/dashboard/MobileKpiCard.tsx` | Add `observationCount` prop, render icon+count |
| `src/components/review/UnifiedScorecard.tsx` | Fetch batch observations, pass counts |
| `src/components/review/EmployeeScorecard.tsx` | Fetch batch observations, pass counts |
| `src/components/review/AuditScorecard.tsx` | Fetch batch observations, pass counts |
| `src/components/review/ManagementScorecard.tsx` | Fetch batch observations, pass counts |
| `DOCUMENTATION.md` | v2.15.15 |
| `POLICY.md` | Dashboard observation visibility invariant |

### Risk Assessment
- **Regression**: Zero — optional prop, no change when not passed
- **Clutter**: Minimal — icon+number only, no badge chrome, amber color distinguishes from red query badge
- **Performance**: Single batch query per dashboard, cached by React Query

