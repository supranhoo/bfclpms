

# Plan: Auto-Unlock Daily-Frequency KPIs for Employee Data Entry

## Problem
Daily-frequency KPIs require continuous data entry throughout the month. When governance locks "Edit KPI" and "Self Review" for the Employee role, daily KPIs become read-only even though they need ongoing input. This blocks employees like Samir from feeding daily data.

## Change

### `src/components/review/SelfReviewSheet.tsx` (~line 505-511)
Extend the governance bypass to include daily-frequency KPIs at `kra_set` status:

```typescript
// Detect sent-back KPI: status reverted to kra_set but a prior submission exists
const isSentBack = isKraSet && selectedKpi && submissionMap.has(selectedKpi.id);

// Daily KPIs need continuous data entry — bypass governance lock at kra_set
const isDailyUnlocked = isKraSet && selectedKpi?.frequency?.toLowerCase() === 'daily';

// Governance lock does NOT apply to sent-back or daily KPIs
const isGovernanceLocked = !isSentBack && !isDailyUnlocked && (!govPerms.submit_self_review || govPerms.view_only);
```

Also add an info banner (similar to the sent-back banner) when `isDailyUnlocked` is true and governance would otherwise be locked, informing the employee that daily data entry is permitted.

### `POLICY.md`
Add policy entry: "Daily-frequency KPIs bypass governance read-only locks at `kra_set` status to allow continuous data entry."

### `DOCUMENTATION.md`
Update governance bypass section to include the daily-frequency exception alongside the sent-back exception.

## Risk Assessment
- **Data Impact**: None — no schema changes
- **Regression Risk**: Low — only adds one more boolean condition to the existing bypass logic
- **Security**: Safe — employees can only edit their own KPIs (RLS enforced), limited to daily frequency at `kra_set`

