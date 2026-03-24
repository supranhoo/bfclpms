

## Add Dashboard Widget + Email Alert for Pending Incentive Adjustments

### What This Solves
When a Quarterly KPI resolves and changes an employee's past-month slab (e.g., 4.9 → 3.5), the payroll preparer currently must manually check the Retroactive Adjustment tab. This adds two proactive alert mechanisms.

### Changes

#### 1. Admin Dashboard Widget — `src/pages/admin/AdminDashboard.tsx`

Add a "Pending Incentive Adjustments" stat card (similar to "Pending Rollbacks") that:
- Uses the existing `usePendingAdjustmentCount()` hook from `useIncentiveRecords.ts`
- Shows count of unnotified revisions with a warning color when > 0
- Clicks through to `/reports/incentive`
- Import `usePendingAdjustmentCount` and add a 6th StatCard in the key stats grid

#### 2. Email Notification — `supabase/functions/detect-retroactive-incentive-changes/index.ts`

After creating revision records, if `revisionsCreated > 0`:
- Query `profiles` with role `hr_pms` or `admin` to get payroll/HR recipients
- Call the existing `send-email-notification` edge function with a new event type `incentive_retroactive_alert`
- Email body includes: count of affected employees, affected months, and a prompt to check the Incentive Report

#### 3. Email Template — `supabase/functions/send-email-notification/index.ts`

Add `incentive_retroactive_alert` to the event type handler:
- Subject: "Incentive Slab Changes Detected — Action Required"
- Body: Summary table of revision count, affected period, and link to the report
- Recipients: HR/PMS and admin users (passed by the detect function)

#### 4. ActionItemsCards Enhancement — `src/components/management/ActionItemsCards.tsx`

Add a 4th action item card for "Incentive Adjustments" using the pending count, navigating to `/reports/incentive`. Accept `pendingIncentiveAdjustments` as a new prop.

Update `ManagementDashboard.tsx` to pass `pendingAdjustments` to `ActionItemsCards`.

### Files Modified
- `src/pages/admin/AdminDashboard.tsx` — add pending adjustments stat card
- `src/components/management/ActionItemsCards.tsx` — add incentive adjustments action item
- `src/pages/ManagementDashboard.tsx` — pass pending count to ActionItemsCards
- `supabase/functions/detect-retroactive-incentive-changes/index.ts` — send email after revisions created
- `supabase/functions/send-email-notification/index.ts` — add `incentive_retroactive_alert` template

