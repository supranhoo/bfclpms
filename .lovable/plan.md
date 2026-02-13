

# Feature: Batch KRA Assignment Notification (Single Consolidated Email)

## Problem

1. The `kra_assigned` email template exists but is **never triggered** -- none of the KRA assignment flows (Bulk Assign, Smart Assign, Copy KRAs, Bundle Assign, Import, Rollover) send notifications today.
2. The current template is designed for a single KRA, but the requirement is: if 10 KRAs are assigned at once, only **1 consolidated email** should be sent per recipient (employee + their reporting manager).

## Solution

Create a new `kra_batch_assigned` event type with a table-based email template, and trigger it from all assignment flows. Each flow collects all KRAs it just assigned, then fires one notification + one email per recipient.

## Before / Changes / After

### Before
- No notification or email is sent when KRAs are assigned via any admin flow
- The `kra_assigned` template exists in the editor but is a dead letter (single KRA format)

### Changes
- Add a new `kra_batch_assigned` event type to the edge function with a table-based HTML template
- Update all 4 client-side assignment flows to trigger a consolidated notification + email after successful insert
- Add the new event to the EmailNotificationSettings toggle list and EmailTemplateEditor

### After
- When an admin assigns KRAs (via any method), the employee receives:
  - 1 in-app notification summarizing all assigned KRAs
  - 1 email with a professional table listing all KRAs (KRA Name, KPI Name, Target, Weightage, UOM)
- The employee's reporting manager receives the same consolidated email
- The email template looks like this:

```text
+----------------------------------------------------------+
|  [Logo]                                                  |
|  +----------------------------------------------------+  |
|  |  [Blue Header]                                     |  |
|  |  📋 New KRA Assignment                             |  |
|  +----------------------------------------------------+  |
|                                                          |
|  Hi John Doe,                                            |
|                                                          |
|  10 KRA(s) have been assigned to you for                 |
|  February 2026.                                          |
|                                                          |
|  +----+----------------+---------+--------+-----+-----+  |
|  | #  | KRA            | KPI     | Target | Wt% | UOM |  |
|  +----+----------------+---------+--------+-----+-----+  |
|  | 1  | Sales Perf.    | Revenue | 100000 | 15% | INR |  |
|  | 2  | Operations     | Defects |     5  | 10% | %   |  |
|  | 3  | Customer Sat.  | NPS     |    80  | 10% | Num |  |
|  | ...| ...            | ...     |  ...   | ... | ... |  |
|  +----+----------------+---------+--------+-----+-----+  |
|                                                          |
|  Total Weightage: 100%                                   |
|                                                          |
|  Please log in to review your assignments.               |
|                                                          |
|  +----------------------------------------------------+  |
|  |  Automated notification from PMS                   |  |
|  +----------------------------------------------------+  |
+----------------------------------------------------------+
```

- For the **Reporting Manager**, the email says:
  "10 KRA(s) have been assigned to John Doe for February 2026."

## Technical Details

### 1. Edge Function: `send-email-notification/index.ts`

Add a new `kra_batch_assigned` event type that accepts a `kra_list` array in the request body:

```typescript
// New request field:
kra_list: Array<{ kra_name: string; kpi_name: string; target_value: string; weightage: string; uom: string }>
```

The `buildEmailHtml` function gets a special branch for `kra_batch_assigned` that renders an HTML table instead of plain text paragraphs. The existing `buildEmailHtml` remains unchanged for all other event types.

New placeholders for the template editor:
- `{{kra_count}}` -- number of KRAs assigned
- `{{kra_table}}` -- auto-generated HTML table (not editable, injected at render time)
- `{{employee_name}}` -- name of the employee receiving KRAs (used in manager email)

### 2. Client-Side: Add notification helper

Create a small shared utility in `src/lib/kraNotifications.ts`:

```typescript
async function sendKraAssignmentNotifications(
  employeeId: string,
  kras: { kra_name: string; kpi_name: string; target_value: any; weightage: any; uom: string }[],
  reviewPeriod: string,
  reviewYear: number
)
```

This function:
1. Fetches the employee profile (name + `reporting_manager_id`) and manager profile (name + email)
2. Inserts 1 in-app notification for the employee, 1 for the manager
3. Calls `send-email-notification` once for the employee, once for the manager, both with `event_type: 'kra_batch_assigned'` and the full `kra_list`

### 3. Assignment Flows to Update

| File | Change |
|------|--------|
| `src/components/admin/CopyKrasDialog.tsx` | After successful insert, call `sendKraAssignmentNotifications()` for each target employee |
| `src/components/admin/BulkTemplateAssignDialog.tsx` | After successful insert, call for each target employee |
| `src/components/admin/BundleAssignDialog.tsx` | After successful insert, call for each target employee |
| `src/components/admin/SmartAssignmentDialog.tsx` | After successful insert (both bundle and template modes), call for the target employee |

### 4. Template Editor + Settings

| File | Change |
|------|--------|
| `src/components/admin/EmailTemplateEditor.tsx` | Add `kra_batch_assigned` template entry with note that `{{kra_table}}` is auto-generated |
| `src/components/admin/EmailNotificationSettings.tsx` | Add toggle for `kra_batch_assigned` |
| `src/hooks/useEmailNotificationSettings.ts` | Add `kra_batch_assigned` to the event type union |

### 5. Documentation

Update `DOCUMENTATION.md` with the new consolidated notification behavior.

### Files Summary

| Action | File |
|--------|------|
| Create | `src/lib/kraNotifications.ts` |
| Edit | `supabase/functions/send-email-notification/index.ts` |
| Edit | `src/components/admin/CopyKrasDialog.tsx` |
| Edit | `src/components/admin/BulkTemplateAssignDialog.tsx` |
| Edit | `src/components/admin/BundleAssignDialog.tsx` |
| Edit | `src/components/admin/SmartAssignmentDialog.tsx` |
| Edit | `src/components/admin/EmailTemplateEditor.tsx` |
| Edit | `src/components/admin/EmailNotificationSettings.tsx` |
| Edit | `src/hooks/useEmailNotificationSettings.ts` |
| Edit | `DOCUMENTATION.md` |

### Infrastructure Impact

- **Zero** new database tables or migrations
- **Zero** new RLS policies
- Reuses existing `notifications` table INSERT and `send-email-notification` edge function
- The old single-KRA `kra_assigned` template remains available for backward compatibility but the new `kra_batch_assigned` is the one triggered by assignment flows

