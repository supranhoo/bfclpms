

## Plan: Hide "Final Rating" Column in Incentive Report (UI only)

### Scope
Remove the **Final Rating** column from the on-screen Incentive Report table only. Keep the field intact in the Excel export.

### Change

**File:** `src/components/incentive/MonthlyIncentiveTable.tsx`
- Remove the `<TableHead>Final Rating</TableHead>` header cell.
- Remove the corresponding `<TableCell>` rendering the rating badge in each row.
- Adjust any `colSpan` used by empty-state rows accordingly (current count drops by 1).

**File:** Excel export module (likely `src/lib/incentiveExportExcel.ts` or wherever `useExportIncentiveExcel` is defined) — **no change**. Verify the `Final Rating` column remains in the export sheet.

### UI Mock (after)

```text
Employee │ Period │ PMS Score │ KPI Status │ Slab │ Base % │ ...
```
(Final Rating column removed between PMS Score and KPI Status)

### Files Touched

| File | Change |
|---|---|
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Remove Final Rating header + cell; fix empty-state colSpan |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None — pure UI hide |
| Workflow | None |
| Excel export | Untouched — column remains |
| Regression | Very low — only column removal + colSpan adjustment |
| Mitigation | Verify empty-state row still spans full table width |

