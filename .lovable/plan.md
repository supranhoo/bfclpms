

## Add "Rated by System" Badge to KPI Dashboard Rows

### What Changes
Add an orange "Rated by System" badge next to any KPI whose submission has an `auto_advance_reason` value. This provides at-a-glance visibility that the system auto-scored/auto-advanced the KPI, similar to how Org KPIs show a distinctive indicator.

### Files Modified

#### 1. `src/components/review/KpiDetailsTable.tsx`
- After the existing "Sent Back" badges (line ~391), add a new badge that checks `submission?.auto_advance_reason`:
```tsx
{submission?.auto_advance_reason && (
  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-900/20 dark:text-orange-400 gap-0.5">
    <Zap className="h-2.5 w-2.5" />
    Rated by System
  </Badge>
)}
```
- Import `Zap` icon from lucide-react (or `Bot` — whichever fits better visually)

#### 2. `src/components/dashboard/MobileKpiCard.tsx`
- After the KRA/KPI name lines (line ~96), add the same orange badge when submission has `auto_advance_reason`:
```tsx
{submission?.auto_advance_reason && (
  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-300 bg-orange-50 text-orange-700 ...">
    Rated by System
  </Badge>
)}
```

### No database changes needed.

