

# Add "Weightage" Column to KPI Details Table

## What Changes

Add a **Weightage** column to the unified `KpiDetailsTable` component, positioned after the "Target" column and before the dynamic score columns. Since this component is shared across all dashboards (My KPIs, Team Review, Audit, Management), the change will apply everywhere automatically.

## Details

### File: `src/components/review/KpiDetailsTable.tsx`

1. **Update `totalColumns` calculation** (line 143): Increment from `4 + visibleColumns.length + 2` to `5 + visibleColumns.length + 2` to account for the new column.

2. **Add table header** (after line 279, the "Target" TableHead): Insert `<TableHead>Weightage</TableHead>`.

3. **Add table cell** (after line 360, the Target TableCell): Insert a cell displaying `kpi.weightage` with a `%` suffix:
   ```
   <TableCell>
     <span className="text-sm">{kpi.weightage ?? 0}%</span>
   </TableCell>
   ```

4. **Update `DOCUMENTATION.md`**: Note the added column in the KPI Details Table description.

### No other files need to change -- the component is already used everywhere via a single import.
