

## Add Frequency Badge Next to KPI Name in Pending Review Tables

### Summary
Show a small colored badge (Bi-Monthly / Quarterly) next to the KPI name in all pending review table rows, matching the existing dashboard styling. Only non-monthly frequencies get a badge.

### Changes

#### File: `src/pages/admin/PendingSelfReviews.tsx`

1. **Add Badge import** (already imported).

2. **Replace plain KPI text cells** in all five tabs (Self-Review, Manager Review, Skip-Level, Sent Back, Rollback) from:
   ```tsx
   <TableCell>{item.kpiName}</TableCell>
   ```
   To:
   ```tsx
   <TableCell>
     <span className="inline-flex items-center gap-1.5 flex-wrap">
       {item.kpiName}
       {item.frequency === 'Bi-Monthly' && (
         <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-violet-300 text-violet-700">Bi-Monthly</Badge>
       )}
       {item.frequency === 'Quarterly' && (
         <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-teal-300 text-teal-700">Quarterly</Badge>
       )}
     </span>
   </TableCell>
   ```

3. **Verify `frequency` field exists** on all interfaces (`OverdueKpi`, `SentBackKpi`, `AutoScoredKpi`, `PenalizedManagerKpi`) — already added in the previous change.

### No database changes needed

