

## Truncate KPI Text Before "Formula" / "Logic" on All Dashboard Views

### What Changes
Add a utility `getKpiSummaryText(text)` that returns all text **before** the first occurrence of "Formula" (case-insensitive). If "Formula" is not found, truncate before "Logic". If neither is found, return the full text. This only affects dashboard/table/card views — the "View KPI Details" panel remains unchanged.

### Utility

**`src/lib/textFormatting.ts`** — Add new function:
```typescript
export function getKpiSummaryText(text: string | null | undefined): string {
  if (!text) return '';
  const normalized = normalizeKpiText(text);
  // Find first occurrence of "Formula" (case-insensitive)
  const formulaIdx = normalized.search(/formula/i);
  if (formulaIdx > 0) return normalized.slice(0, formulaIdx).trim();
  // Fallback: find "Logic"
  const logicIdx = normalized.search(/logic/i);
  if (logicIdx > 0) return normalized.slice(0, logicIdx).trim();
  return normalized;
}
```

### Files to Update (display only — replace `kpi.kpi_name` rendering)

| File | What | Line area |
|------|------|-----------|
| `src/components/review/KpiDetailsTable.tsx` | Main KPI table row | ~416-418 |
| `src/components/review/MobileKpiCard.tsx` | Review mobile card | ~294-296 |
| `src/components/dashboard/MobileKpiCard.tsx` | Dashboard mobile card | ~97 |

In each file:
- Import `getKpiSummaryText` from `@/lib/textFormatting`
- Replace `renderBoldKpiText(kpi.kpi_name)` with `renderBoldKpiText(getKpiSummaryText(kpi.kpi_name))`
- No changes to any detail/sheet/panel views

### No database changes needed

### Risk
- None. Display-only change. Full text remains in "View KPI Details".

