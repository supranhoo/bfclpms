

## Merge Category + KRA into Single Column

### Change — `src/components/admin/KraIssuanceConfirmDialog.tsx`

Combine the "Category" and "KRA" columns into one "Category / KRA" column. The category badge renders on top, KRA name below it. This frees ~130px+ of horizontal space for the KPI column.

**Header**: Remove separate Category and KRA `<TableHead>`, replace with single `<TableHead>Category / KRA</TableHead>` with `min-w-[200px]`

**Cell**: Stack category badge and KRA name vertically:
```tsx
<TableCell className="align-top">
  <Badge variant="outline" className="text-xs mb-1">{getCategoryName(kpi.category_id)}</Badge>
  <div className="font-medium whitespace-normal leading-snug">{kpi.kra_name}</div>
</TableCell>
```

**KPI column**: Increase from `min-w-[200px]` to `min-w-[300px]` to use the reclaimed space.

### Files Changed
1. **`src/components/admin/KraIssuanceConfirmDialog.tsx`** — Merge Category + KRA into one column, widen KPI column

