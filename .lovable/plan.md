

# Rollback Request Feature: User-Initiated KPI Status Reversal

## Overview

This feature allows any workflow participant (Employee, Manager, Skip-Level, HR PMS, Auditor) to request a rollback of a KPI they have already submitted/forwarded. The next-level reviewer sees a prominent red notification banner with a "Roll Back" button. Clicking it moves the KPI back to the requester's stage so they can make corrections and resubmit.

---

## How It Works

```text
Employee submits KPI (status: self_review)
  |
  v
Employee realizes error -> clicks "Request Rollback"
  |
  v
KPI gets a rollback_requested flag (stored in DB)
  |
  v
Manager opens KPI -> sees RED banner: "Employee has requested a rollback"
  with a [Roll Back] button next to Approve/Send Back
  |
  v
Manager clicks [Roll Back]
  -> KPI status reverts to kra_set (previous stage)
  -> Employee can now edit and resubmit
```

This works at every level: Manager can request rollback from Auditor, Auditor from Management, etc.

---

## Database Changes

### New table: `kpi_rollback_requests`

| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| kpi_id | UUID (FK to kpis) | The KPI being rolled back |
| requested_by | UUID (FK to profiles) | Who requested the rollback |
| requested_from_status | text | Status when request was made (e.g., `self_review`) |
| target_status | text | Status to revert to (e.g., `kra_set`) |
| reason | text | Mandatory justification |
| status | text | `pending`, `approved`, `rejected` (default: `pending`) |
| actioned_by | UUID | Who approved/rejected |
| actioned_at | timestamptz | When it was acted on |
| created_at | timestamptz | Request timestamp |

RLS policies:
- Users can INSERT if they are the `requested_by`
- Users can SELECT if the KPI belongs to an employee they manage or if they are the requester
- Reviewers can UPDATE (to approve/reject) based on their role relationship to the KPI

### Notification event type

Add a new notification type `rollback_requested` to the existing notifications table. When a rollback is requested, a notification is created for the next-level reviewer(s).

---

## UI Changes

### 1. "Request Rollback" Button (Requester Side)

**Where**: Inside the KPI detail views -- both `SelfReviewSheet` (for employees) and `UnifiedScorecard` (for reviewers viewing already-submitted KPIs in read-only mode).

**Visibility condition**: The KPI has been submitted by this level (i.e., current status is one step ahead of where this user operates), AND no pending rollback request already exists for this KPI, AND status is not `approved`.

**Example for Employee**: If KPI status is `self_review` (meaning employee already submitted), show a "Request Rollback" button in the sheet footer.

**Example for Manager**: If KPI status is `manager_check` or further (meaning manager already forwarded), and manager is viewing it in read-only mode, show the button.

**UX flow**:
- User clicks "Request Rollback"
- A dialog appears asking for a mandatory reason
- On submit: creates a row in `kpi_rollback_requests` + creates a notification for the next-level reviewer

### 2. Red Rollback Banner (Reviewer Side)

**Where**: Inside `UnifiedScorecard` review sheet, displayed prominently above the action buttons when a pending rollback request exists for the selected KPI.

**Appearance**:
- Red/rose background banner with warning icon
- Text: "[Employee Name] has requested a rollback for this KPI"
- Shows the reason provided
- A prominent "Roll Back" button (red/destructive variant)
- A "Dismiss" option to reject the request

**When "Roll Back" is clicked**:
1. KPI status is reverted to the previous stage using `resolvePreviousStatus()` from the workflow engine
2. The rollback request status is updated to `approved`
3. An audit log entry is created in `kpi_audit_logs`
4. A notification is sent to the requester confirming the rollback
5. All relevant query caches are invalidated

**When "Dismiss" is clicked**:
1. The rollback request status is updated to `rejected`
2. A notification is sent to the requester informing them

---

## New Components

| Component | Purpose |
|---|---|
| `RollbackRequestDialog.tsx` | Modal for submitting a rollback request with mandatory reason |
| `RollbackRequestBanner.tsx` | Red banner shown to reviewers with Roll Back / Dismiss actions |

## New Hook

| Hook | Purpose |
|---|---|
| `useKpiRollbackRequests.ts` | Queries pending rollback requests for a KPI; mutations for create, approve, reject |

---

## Files to Modify

| File | Change |
|---|---|
| **New migration** | Create `kpi_rollback_requests` table with RLS policies |
| **src/hooks/useKpiRollbackRequests.ts** (new) | Hook for CRUD operations on rollback requests |
| **src/components/review/RollbackRequestDialog.tsx** (new) | Dialog component for requesting rollback |
| **src/components/review/RollbackRequestBanner.tsx** (new) | Red banner component for reviewers |
| **src/components/review/SelfReviewSheet.tsx** | Add "Request Rollback" button when KPI is in `self_review` status (employee already submitted) |
| **src/components/review/UnifiedScorecard.tsx** | Add "Request Rollback" button in read-only mode; Add `RollbackRequestBanner` above action buttons in review mode |
| **src/hooks/useNotifications.ts** | Add `rollback_requested` and `rollback_approved` event types |
| **src/lib/workflowEngine.ts** | Already has `resolvePreviousStatus()` -- no changes needed |
| **DOCUMENTATION.md** | Document the new feature |

---

## Technical Details

### Determining "who is the next reviewer"

When creating a rollback request notification, the system needs to notify the correct person. This is determined by:
- For employee requests: notify the employee's reporting manager
- For manager requests: resolved dynamically using the workflow -- could be skip-level, HR PMS, auditor, etc.
- The existing notification creation patterns in `useKpis.ts` (used by `useRaiseQuery`) will be followed

### Clearing downstream data on rollback

When a rollback is approved, downstream review data (ratings, scores, remarks) entered by the approving reviewer should be cleared, consistent with the existing Step Back behavior in `useAdminDataEntry.ts`. The rollback approval mutation will handle this.

### Preventing duplicate requests

Only one `pending` rollback request per KPI is allowed. The UI hides the "Request Rollback" button if one already exists, and a unique partial index enforces this at the database level.

---

## Edge Cases

- **KPI already approved**: Rollback requests are not allowed for approved KPIs
- **Multiple KPIs**: Each KPI's rollback request is independent
- **Concurrent actions**: If the reviewer forwards the KPI before seeing the rollback request, the request is auto-expired (status set to `expired` via a trigger that fires on KPI status change)
- **Admin override**: Admins can still use the existing "Step Back" feature independently of this workflow

