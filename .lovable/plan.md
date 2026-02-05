

# Plan: Fix Silent RLS Failure in Manager KPI Approval ✅ COMPLETED

## Summary

Fixed silent RLS failures in all approval hooks by adding row count validation.

## Changes Made

1. **`src/hooks/useKpis.ts` - `useApproveKpi`**: Added `.select()` and row count validation
2. **`src/components/review/AuditScorecard.tsx` - `submitAuditReview`**: Added `.select()` and row count validation  
3. **`src/components/review/ManagementScorecard.tsx` - `submitManagementReview`**: Added `.select()` and row count validation
4. **`DOCUMENTATION.md`**: Documented RLS permission model for reviewers

Users now see clear error messages when RLS blocks approval attempts, instead of misleading success toasts.

