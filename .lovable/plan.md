

# Improve Duplicate KPI Error Handling

## Problem
When an admin tries to assign a KPI that already exists for the same employee + period + KRA + KPI combination, the raw database constraint error (`duplicate key value violates unique constraint "idx_kpis_no_duplicates"`) is shown. This is confusing and unhelpful.

## Fix — `src/hooks/useKpis.ts`

In the `useCreateKpi` `onError` handler (line 372-374), detect the unique constraint violation and show a user-friendly message:

```typescript
onError: (error: Error) => {
  const isDuplicate = error.message?.includes('idx_kpis_no_duplicates') 
    || error.message?.includes('duplicate key');
  toast({ 
    title: 'Failed to create KPI', 
    description: isDuplicate 
      ? 'This KRA/KPI is already assigned to this employee for the selected review period. Please choose a different KPI or period.' 
      : error.message, 
    variant: 'destructive' 
  });
},
```

Single file change, one block replaced.

