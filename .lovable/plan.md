
# Implementation Plan: Dashboard, Inbox, Query, Review & Policy Features

## Overview
This plan addresses 10 feature requests across multiple areas: notifications, team review, queries, admin KPI management, submission restrictions, review workflow, and PMS policy viewing.

---

## Items to Implement

### 1. Inbox - Show Employee Name in Notifications
**Current Issue:** Notification messages show generic "Employee submitted self-review..." instead of the employee's actual name and code.

**Root Cause:** The notification creation happens in a database trigger (`notify_on_kpi_status_change`) that uses `auth.uid()` to get the actor but displays a generic "Employee" text.

**Solution:**
- Update the database trigger to fetch and include the employee's name and code in the notification message
- Message format: `"Rahul Sharma (EMP001) submitted self-review for KPI: Amount discrepancy"`

**Technical Changes:**
| File/Location | Change |
|---------------|--------|
| Database migration | Update `notify_on_kpi_status_change` trigger to fetch employee full_name and employee_code from profiles table and include in message |

---

### 2. Team Review - Add "Open" Box in Dashboard
**Current Issue:** Team Review dashboard shows Total KPIs, Pending Review, and Reviewed, but no "Open" count for KPIs at `kra_set` status that haven't been submitted yet.

**Solution:**
- Add a new stat card for "Open KPIs" showing count of KPIs at `kra_set` status
- Rearrange stats row to: Total Employees | Open KPIs | Pending Review | Reviewed

**Technical Changes:**
| File | Change |
|------|--------|
| `src/pages/TeamReview.tsx` | Add `openKpis` count to stats calculation (KPIs where `status === 'kra_set'`) |
| `src/pages/TeamReview.tsx` | Add new stat card with purple/indigo styling for "Open KPIs" |

---

### 3a. Query - Reply Received Not Showing in Query Tab
**Current Issue:** When a query is resolved, the reply shows in the "Sent" tab but not visible properly in the "Received" tab for the original raiser.

**Root Cause Analysis:** The query system shows queries in:
- "Received" tab: Queries where `raised_to === user.id` 
- "Sent" tab: Queries where `raised_by === user.id`

When a query is resolved, it stays in the same tab structure. The issue is that the person who raised the query doesn't see the resolution in their view because resolution updates the query but doesn't notify properly.

**Solution:**
- The "Sent" tab should clearly show resolution notes when a query is resolved
- Ensure resolution notes are prominently displayed in both tabs
- Add a "Replies" indicator for resolved queries

**Technical Changes:**
| File | Change |
|------|--------|
| `src/pages/QueryInbox.tsx` | Enhance `renderQueryCard` to show resolution notes more prominently for resolved queries in Sent tab |
| `src/pages/QueryInbox.tsx` | Add visual distinction for resolved queries with replies |

---

### 3b. Query - Resolved Tile Showing Incorrect Data
**Current Issue:** The "Resolved" count tile shows incorrect data.

**Root Cause:** Currently `resolvedQueries` counts only from `receivedQueries` (queries where user is the recipient), not including queries the user raised that have been resolved.

**Solution:**
- Create separate counts:
  - "Resolved (Received)": Queries raised TO me that I resolved
  - "Resolved (Sent)": Queries I raised that were resolved by others
- Or show total resolved across both

**Technical Changes:**
| File | Change |
|------|--------|
| `src/pages/QueryInbox.tsx` | Update `resolvedQueries` calculation to include both received and sent resolved queries |
| `src/pages/QueryInbox.tsx` | Update the Resolved stat card to show combined count |

---

### 4. Admin KPI Status Change with Notifications
**Current Issue:** Admin can edit KPIs but cannot change status with a remark and send notifications to relevant stakeholders.

**Solution:**
- Enhance `AdminKpiEditDialog` to:
  - When status changes, require a remark explaining the change
  - Trigger notifications to:
    - The employee who owns the KPI
    - The employee's reporting manager
    - All users who approved/reviewed the KPI at previous stages (based on workflow)
  - Log the status change in audit logs with reason

**Technical Changes:**
| File | Change |
|------|--------|
| `src/components/admin/AdminKpiEditDialog.tsx` | Add status change detection and require reason when status changes |
| `src/hooks/useKpis.ts` | Enhance `useAdminUpdateKpi` to create notifications when status changes |
| Database migration | Create a trigger or add logic to send notifications on admin status override |

---

### 5. Employee Can Submit KPI Only Once
**Current Issue:** Employees can resubmit their self-review multiple times for the same KPI.

**Solution:**
- After initial submission, lock the KPI from further employee edits
- Only allow edits if:
  - KPI is sent back for revision (`kpi_status === 'sent_back'`)
  - Status is reset by admin

**Technical Changes:**
| File | Change |
|------|--------|
| `src/pages/MyKpis.tsx` | Disable "Submit" button and show "Submitted" badge once KPI status is not `kra_set` |
| `src/pages/SelfReview.tsx` | Same changes as MyKpis.tsx |
| `src/hooks/useKpis.ts` | Add check in `useSubmitSelfReview` to prevent re-submission unless `kpi_status === 'sent_back'` |

---

### 6. Clarification: Submit Review vs Approve Button
**Current Issue:** In Team Review > Review Sheet, there are both "Submit Review" and "Approve" buttons.

**Current Behavior Analysis:**
- **Submit Review**: Updates manager score/remarks but keeps status at `self_review`
- **Approve**: Updates manager score/remarks AND advances status to `manager_check`

**Recommendation:** These serve different purposes:
- "Submit Review" = Save draft/partial review without moving forward
- "Approve" = Finalize and advance to next stage

**Solution:** Keep both buttons but clarify labels and add Send Back + Raise Query inside the sheet:
- Rename "Submit Review" to "Save Draft"
- Keep "Approve" 
- Add "Send Back" button
- Add "Raise Query" button

---

### 7. Send Back & Raise Query Buttons Inside Review Window
**Current Issue:** These buttons are in the table row, not inside the review sheet.

**Solution:**
- Move Send Back and Raise Query buttons into the review sheet footer
- Keep them visible when review sheet is open
- Remove or reduce them from the table row (keep small icons for quick access if needed)

**Technical Changes:**
| File | Change |
|------|--------|
| `src/components/review/EmployeeScorecard.tsx` | Move Send Back and Raise Query buttons into `SheetFooter` |
| `src/components/review/EmployeeScorecard.tsx` | Update footer layout: Cancel | Send Back | Raise Query | Save Draft | Approve |

---

### 8. PMS Policy Viewing Option
**Current Issue:** No way for users to view the company's PMS Policy document.

**Solution:**
- Add a new "PMS Policy" field in app_settings (URL to policy document)
- Add a new "Policy" menu item in sidebar (visible to all roles)
- Create a Policy page that displays the policy in an iframe or as PDF viewer
- Alternatively, add a floating help button or link in sidebar footer

**Technical Changes:**
| File | Change |
|------|--------|
| Database migration | Add `pms_policy_url` column to `app_settings` table |
| `src/hooks/useAppSettings.ts` | Add `pms_policy_url` to interface and query |
| `src/pages/admin/SystemSettings.tsx` | Add policy URL input in Branding tab |
| `src/components/layout/AppSidebar.tsx` | Add "PMS Policy" link in sidebar (opens policy URL in new tab or modal) |
| `src/pages/PMSPolicy.tsx` (new) | Create a page to display the policy document |

---

## Implementation Order

1. **Database Migrations First:**
   - Update `notify_on_kpi_status_change` trigger for employee name (#1)
   - Add `pms_policy_url` to `app_settings` (#8)
   - Add notification logic for admin status changes (#4)

2. **Query Fixes (#3a, #3b)**
3. **Team Review - Open KPIs stat (#2)**
4. **Employee Submission Lock (#5)**
5. **Review Sheet Button Reorganization (#6, #7)**
6. **PMS Policy Feature (#8)**

---

## Summary of File Changes

| File | Changes |
|------|---------|
| `src/pages/QueryInbox.tsx` | Fix resolved count, improve reply visibility |
| `src/pages/TeamReview.tsx` | Add "Open KPIs" stat card |
| `src/pages/MyKpis.tsx` | Lock KPI after submission |
| `src/pages/SelfReview.tsx` | Lock KPI after submission |
| `src/hooks/useKpis.ts` | Submission lock logic, admin notification logic |
| `src/components/review/EmployeeScorecard.tsx` | Reorganize review sheet buttons |
| `src/components/admin/AdminKpiEditDialog.tsx` | Status change notifications |
| `src/components/layout/AppSidebar.tsx` | Add PMS Policy link |
| `src/hooks/useAppSettings.ts` | Add pms_policy_url |
| `src/pages/admin/SystemSettings.tsx` | Add policy URL input |
| `src/pages/PMSPolicy.tsx` (new) | Policy viewing page |
| `DOCUMENTATION.md` | Update with all changes |
| Database migration | Trigger updates, new columns |
