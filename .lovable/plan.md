

## Add Frequency Column to Excel Exports Only

### Changes

#### File: `src/pages/admin/PendingSelfReviews.tsx`

1. **`handleExportExcel`** (line 271): Add `'Frequency': k.frequency || '-'` to the row object.
2. **`handleExportSentBack`** (line 297): Add `'Frequency'` — requires adding `frequency` to `SentBackKpi` interface and mapping.
3. **`handleExportRollback`** (lines 318, 334): Add `'Frequency'` — requires adding `frequency` to `AutoScoredKpi` and `PenalizedManagerKpi` interfaces and mappings.
4. Update `!cols` widths in all three export functions to include the new column.

#### File: `src/hooks/usePendingSelfReviews.ts`

1. **`SentBackKpi` interface** (line 626): Add `frequency: string`.
2. **Sent-back mapping** (line 697): Add `frequency: kpi.frequency || ''`. The query already selects `frequency` from kpis.
3. **`AutoScoredKpi` interface** (line 762): Add `frequency: string`.
4. **`PenalizedManagerKpi` interface** (line 777): Add `frequency: string`.
5. **Auto-scored mapping** and **penalized mapping**: Add `frequency` from the kpi record. Verify the queries select `frequency` — if not, add it.

### No database changes needed

