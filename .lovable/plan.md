

## Fix: Show "Rated by System" Badge for Admin-Scored KPIs

### Root Cause
The "Rated by System" badge checks `submission.auto_advance_reason`, but this field is only set by the `auto-lock-review-periods` edge function. When an admin scores a KPI via the Admin Data Entry dialog or Fast Track Approve, `auto_advance_reason` is never written to the submission.

### Fix — Single file: `src/hooks/useAdminDataEntry.ts`

**1. `useAdminSubmitReviewData` (line ~165)** — When upserting the submission, add `auto_advance_reason`:
```typescript
auto_advance_reason: `Scored by Admin on behalf of ${role_level}`,
```

**2. `useAdminFastTrackApprove` (line ~702)** — Add to `updateFields`:
```typescript
auto_advance_reason: `Fast-tracked to Approved by Admin. Reason: ${reason}`,
```

This ensures the orange badge appears on any KPI where admin intervened, whether through single-level data entry or fast-track approval.

### No other files changed. No database changes needed.

