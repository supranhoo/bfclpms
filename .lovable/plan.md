# Plan: Save Achieved Values for Manager, Auditor, and Management Levels

## Status: ✅ COMPLETED

## Summary

Fixed the "Review Journey" section to display achieved values for all review levels (Manager, Auditor, Management) by updating the mutations to persist the achieved value fields to the database.

## Changes Made

### 1. `src/hooks/useKpis.ts`
- Added `manager_achieved_value` parameter to `useApproveKpi` mutation input type
- Included `manager_achieved_value` in the database update query

### 2. `src/components/review/EmployeeScorecard.tsx`
- Updated manager approval call to pass `manager_achieved_value` from component state

### 3. `src/components/review/AuditScorecard.tsx`
- Added `auditor_achieved_value` to `submitAuditReview` mutation input type
- Included `auditor_achieved_value` in the database update query
- Updated mutation call to pass `auditor_achieved_value` from component state

### 4. `src/components/review/ManagementScorecard.tsx`
- Added `management_achieved_value` to `submitManagementReview` mutation input type
- Included `management_achieved_value` in the database update query
- Updated mutation call to pass `management_achieved_value` from component state

### 5. `DOCUMENTATION.md`
- Updated `review_submissions` table description to include achieved value columns
- Added "Achieved Value Persistence" section documenting the feature
- Updated View Level Configurations to show all 4 stages are now visible

## Data Flow After Fix

```text
Manager enters value → managerAchievedValue state ✅
Manager clicks Approve → approveKpi.mutate({ manager_achieved_value }) ✅
Database update → manager_achieved_value saved ✅
Review Journey → Shows "Value: X" for Manager ✅
```

## Visual Result

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    Self     │ │   Manager   │ │   Auditor   │ │ Management  │
│  Value: 15  │ │  Value: 15  │ │  Value: 15  │ │  Value: 15  │
│  Rating: 3  │ │  Rating: 4  │ │  Rating: 4  │ │  Rating: 5  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```
