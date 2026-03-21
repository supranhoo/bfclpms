

## Reorder Dashboard View Mode Tabs

### Change
Reorder the `availableModes` array in `src/pages/Dashboard.tsx` to match the requested sequence:

**My Dashboard → Team Reviews → Self Review → Manager Review → Skip Mgr Review → HR PMS → Audit → Management**

### Modified: `src/pages/Dashboard.tsx` (lines 45-54)

Change the order modes are pushed:

```typescript
const availableModes = useMemo(() => {
  const modes: ViewMode[] = ['self'];
  if (['manager', 'admin', 'management'].includes(role || '') || hasSkipLevelSubordinates) modes.push('team');
  if (role === 'hr_pms' || role === 'admin') {
    modes.push('pending_self_review', 'pending_manager_review', 'pending_skip_review');
  }
  if (role === 'hr_pms' || role === 'admin') modes.push('hr_pms');
  if (['auditor', 'admin'].includes(role || '')) modes.push('audit');
  if (['management', 'admin'].includes(role || '')) modes.push('management');
  return modes;
}, [role, hasSkipLevelSubordinates]);
```

### No other files changed. No database changes needed.

