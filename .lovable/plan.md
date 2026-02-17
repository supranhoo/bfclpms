

# KRA Issuance Confirmation Workflow

## Problem

Currently, all KRA assignment methods (Assign KRA, Smart Assign, Bundle Assign, Copy KRAs) insert KPIs directly into the database and fire notification emails immediately -- without any confirmation step. There is no validation that the total weightage equals 100%, no consolidated review of all KPIs before finalizing, and no way for the admin to verify the full picture before the employee receives the issuance email.

## Solution

Add a **KRA Issuance Confirmation Dialog** accessible from the Admin KPI Dashboard (AllKpis page). When an admin clicks a new "Issue KRAs" button on an employee's expanded row, a dialog opens showing:

1. A detailed table of ALL KPIs assigned to that employee for the selected period
2. Per-KPI details: Category, KRA Name, KPI Name, UOM, Target, Weightage%, Frequency
3. A prominent **total weightage indicator** with validation (green if 100%, red/warning otherwise)
4. A "Confirm and Issue" button that sends the consolidated KRA issuance notification email

The dialog blocks issuance if total weightage is not 100% (with an override toggle for intentional exceptions).

## Current Notification Flow (Before)

```text
Admin assigns KPIs --> KPIs inserted --> Email sent immediately (no review)
```

## New Flow (After)

```text
Admin assigns KPIs --> KPIs inserted (no email yet)
Admin clicks "Issue KRAs" on employee row --> Confirmation Dialog opens
Admin reviews all KPIs + weightage --> Clicks "Confirm & Issue"
--> Email sent to employee + manager
--> KPIs marked as "issued" (new field)
```

## Changes

### 1. Database: Add `is_issued` flag to `kpis` table

A new boolean column `is_issued` (default `false`) tracks whether the admin has formally confirmed and issued the KRA. This separates "assigned" from "issued" states. The existing `status` field remains unchanged.

### 2. New Component: `KraIssuanceConfirmDialog.tsx`

A dialog that:
- Accepts `employeeId`, `employeeName`, `reviewPeriod`, `reviewYear`
- Fetches all KPIs for that employee/period
- Displays a detailed table with columns: #, Category, KRA, KPI, UOM, Target, Weightage, Frequency
- Shows total weightage with color-coded validation (green = 100%, amber = under, red = over)
- Has a "Confirm & Issue" button that:
  - Updates all KPIs to `is_issued = true`
  - Calls `sendKraAssignmentNotifications()` for the consolidated email
  - Shows success toast
- Has a "Allow non-100% weightage" toggle for edge cases
- Shows a warning banner if KPIs are already issued (re-issuance scenario)

### 3. Update `AllKpis.tsx`: Add "Issue KRAs" button

- In the expanded employee row, add a prominent "Issue KRAs" button next to the employee name
- Show a visual indicator (badge) for whether KRAs have been issued or not
- The button opens the new `KraIssuanceConfirmDialog`

### 4. Remove auto-email from existing assignment flows

- Remove `sendKraAssignmentNotifications()` calls from:
  - `SmartAssignmentDialog.tsx`
  - `BundleAssignDialog.tsx`
  - `CopyKrasDialog.tsx`
  - `BulkTemplateAssignDialog.tsx`
- KPIs are still inserted, but email is deferred until issuance confirmation

### 5. Update `DOCUMENTATION.md`

Document the new issuance workflow.

---

## Technical Detail

### Database Migration

```sql
ALTER TABLE public.kpis ADD COLUMN is_issued boolean DEFAULT false;
```

No RLS changes needed -- the existing admin policies already cover updates.

### KraIssuanceConfirmDialog Component Structure

```typescript
interface KraIssuanceConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  reviewPeriod: string;
  reviewYear: number;
}
```

Key sections in the dialog:
- **Header**: Employee name, period, year
- **Weightage Summary Card**: Large number showing total %, color-coded
- **KPI Table**: Scrollable table with all assigned KPIs and their details
- **Footer**: Cancel + "Confirm & Issue KRAs" button (disabled if weightage != 100% and override not toggled)

### Removing Auto-Email from Assignment Dialogs

In each of the 4 dialogs, the `sendKraAssignmentNotifications()` call in the `onSuccess` handler will be removed. The toast messages will be updated to say "KPIs assigned. Use 'Issue KRAs' to send notification."

### Files to Change

| File | Change |
|---|---|
| Database migration | Add `is_issued` column to `kpis` table |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | NEW: Confirmation dialog with weightage validation |
| `src/pages/admin/AllKpis.tsx` | Add "Issue KRAs" button per employee, issued/not-issued badges |
| `src/components/admin/SmartAssignmentDialog.tsx` | Remove `sendKraAssignmentNotifications` call |
| `src/components/admin/BundleAssignDialog.tsx` | Remove `sendKraAssignmentNotifications` call |
| `src/components/admin/CopyKrasDialog.tsx` | Remove `sendKraAssignmentNotifications` call |
| `src/components/admin/BulkTemplateAssignDialog.tsx` | Remove `sendKraAssignmentNotifications` call |
| `DOCUMENTATION.md` | Document KRA issuance workflow |

