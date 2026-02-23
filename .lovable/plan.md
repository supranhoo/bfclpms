

# Remove "KRA Not Issued" from Bottleneck Report

## What's Changing

KPIs that have not been issued to employees (`is_issued === false`) will be completely excluded from the Bottleneck Report. This report should only show KPIs that are actively in the workflow pipeline and stuck at a review stage -- not KPIs that haven't even been assigned yet.

## Changes

### 1. `src/hooks/useBottleneckReport.ts`

- Remove `'not_issued'` from the `StageKey` type union
- Remove the `not_issued` entry from `STAGE_LABELS`
- Remove the `not_issued` cases from `getResponsiblePerson()` and `getResponsibleRole()`
- In the `allRows` processing, filter out KPIs where `is_issued === false` (instead of mapping them to a `not_issued` stage)
- Remove `notIssued` from the `stats` computation
- Remove `isIssued` from the `BottleneckRow` interface

### 2. `src/pages/reports/BottleneckReport.tsx`

- Remove the "Not Issued" summary card
- Remove the `not_issued` entry from `STAGE_COLORS`
- Adjust the summary cards grid (6 cards instead of 7)

### 3. `DOCUMENTATION.md`

- Bump version to **1.45.86**
- Note the exclusion of unissued KPIs from the bottleneck report

## Risk Assessment

| Aspect | Detail |
|--------|--------|
| Data impact | None -- read-only filtering change |
| Regression risk | None -- purely removes a category from an additive report |
