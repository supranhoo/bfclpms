

## Fix: Clarify Propagation Toast Message

### Problem
The toast "Updated 2 KPIs across 1 employees" is misleading when propagating to 1 employee with 1 KPI definition — the "2" refers to 2 monthly KPI records (e.g., Feb + March) but reads as if 2 different KPIs were changed.

### Fix
Update the success toast in `useKpiTemplates.ts` to show month context:

**Current:**
```
Updated 2 KPIs across 1 employees
```

**Proposed:**
```
Updated 2 KPI records for 1 employee (across multiple review periods)
```

When count > employees (meaning multiple periods per employee), append the clarification. Also fix the plural: "1 employee" not "1 employees".

### File Changed
- `src/hooks/useKpiTemplates.ts` — `usePropagateTemplateChange` `onSuccess` toast message (line ~148)

### Detail
```typescript
// Fix grammar + add context
const periodsNote = data.kpis_updated > data.employees_affected 
  ? ' (across multiple review periods)' 
  : '';
toast({
  title: 'Changes Propagated',
  description: `Updated ${data.kpis_updated} KPI record${data.kpis_updated !== 1 ? 's' : ''} for ${data.employees_affected} employee${data.employees_affected !== 1 ? 's' : ''}${periodsNote}`,
});
```

