

# How to Lock January KRAs for Employees While Keeping Other Roles Open

## Answer: This is Already Supported — No Code Changes Needed

The existing **Role Permission Matrix** on the Review Period Governance page (`/admin/review-periods`) handles this exact scenario. Here are the steps:

### Steps for the Admin

1. Go to **Review Period Governance** (`/admin/review-periods`)
2. Select **January [Year]** from the period dropdown
3. Click the **Roles** tab
4. In the Role Permission Matrix, find the **Employee** row and toggle OFF the permissions you want to restrict:
   - **Edit KPI** → OFF
   - **Self Review** → OFF  
   - **Edit Scores** → OFF
   - **Add Comments** → OFF (optional)
   - **View Only** → ON (if you want full read-only mode)
5. Leave **Auditor**, **HR PMS**, **Management**, **Manager**, **Skip Level** rows with all permissions ON (the defaults)
6. Click **Save Permissions**

### How Enforcement Works

- The `check_review_period_permission` RPC evaluates permissions in a hierarchy: **Employee-specific lock > Department lock > Role lock > Global lock**
- When an employee opens their January KRAs, `useReviewPeriodPermissions` calls this RPC for each action, detects the role-level restriction, and returns `view_only: true` / `edit_scores: false`
- The `GovernanceLockBanner` displays a message explaining the restriction
- Input fields, submit buttons, and score editors become disabled
- Meanwhile, Auditor/HR PMS/Management users are unaffected because their role rows still have full permissions

### No Code Changes Required

The feature is fully functional as-is. The Role Permission Matrix, the RPC, and the UI enforcement hooks are all connected.

