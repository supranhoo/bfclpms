

# Plan: Allow Employee Edits on Sent-Back KPIs While Keeping Default Permissions Locked

## Problem
Currently, governance permissions block employees from editing KPI data when "Edit KPI" and "Self Review" are disabled. This blocks ALL employee edits, even for KPIs that were sent back by a reviewer. The desired behavior: fresh KPIs remain locked, but sent-back KPIs should bypass governance to allow the employee to update data.

## Detection Logic
A "sent back" KPI can be identified as: `status === 'kra_set'` AND an existing submission exists in `submissionMap` for that KPI. A fresh KPI has `status === 'kra_set'` with no prior submission.

## Changes

### 1. `src/components/review/SelfReviewSheet.tsx`
Update the `isGovernanceLocked` / `isReadOnly` logic (~line 505-507):

```typescript
// Detect sent-back KPI: status is kra_set but a previous submission exists
const isSentBack = isKraSet && selectedKpi && submissionMap.has(selectedKpi.id);

// Governance lock does NOT apply to sent-back KPIs — employee must be able to respond
const isGovernanceLocked = !isSentBack && (!govPerms.submit_self_review || govPerms.view_only);

const isReadOnly = (!isKraSet && !isSelfReview) || isGovernanceLocked;
```

Also add a small info banner when `isSentBack` is true to inform the employee that this KPI was sent back for revision.

### 2. `src/components/review/GovernanceLockBanner.tsx`
No changes needed — the banner already renders based on the computed permissions. Since sent-back KPIs will bypass the lock, the banner will naturally not appear for them.

### 3. Documentation Updates
- Update `DOCUMENTATION.md` with this policy: "Sent-back KPIs bypass governance read-only locks for the employee role"
- Update `POLICY.md` with the business rule

## Risk Assessment
- **Data Impact**: None — no schema changes
- **Regression Risk**: Low — only affects the `isGovernanceLocked` calculation for one specific condition
- **Security**: Safe — the employee can only edit their own KPIs (enforced by RLS), and only when status is `kra_set` with a prior submission

