### Goal
Add a 4th quick-action card ("Workflow mapping") in the **Edit User → Access & Login → Module Access & Login** section of the User Management page.

### Current State
- The User Management Edit User dialog has 3 existing cards in the Access & Login section:
  1. Grant module roles
  2. Send password
  3. View access history
- These cards are rendered in a grid (currently `md:grid-cols-3`).
- The `/admin/workflow-config` page already exists and can accept query params.

### Changes

#### File: `src/pages/admin/UserManagement.tsx`
1. **Grid layout**: Change the card grid from `md:grid-cols-3` to `md:grid-cols-2 lg:grid-cols-4` so 4 cards fit at ≥1024px and wrap 2×2 below.
2. **New card**: Insert a 4th `<button>` card after "View access history":
   - **Icon**: `GitBranch` from lucide-react
   - **Title**: Workflow mapping
   - **Subtitle**: Assign or change this user's review workflow template.
   - **onClick**: Close the edit dialog and navigate to `/admin/workflow-config?employee=${selectedUser.id}`
3. Ensure `useNavigate` is imported/available.

### Out of Scope
- No changes to `/admin/workflow-config` page
- No new RPCs, schema changes, or RLS changes
- No Bulk Review page changes

### Risk
Pure navigation link. Negligible regression risk. Easy rollback.