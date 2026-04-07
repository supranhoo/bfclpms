

## Non-Login Users: Profile-Only Approach

### Problem
Employees are created in the system purely for KPI tracking/reporting but don't need portal access and often lack email addresses. Currently, fake auth accounts with placeholder emails (`xxx@placeholder-pms.com`) are created for them, wasting auth slots and cluttering the system.

### Solution
Add a **Portal Access** toggle. When disabled, create a `profiles` row **without** an auth account. These users exist for data purposes only (KPI assignment, reviews, reports) but cannot log in.

### How It Works

```text
Admin creates user:
  ├─ Portal Access ON  → create auth account + profile (current flow)
  └─ Portal Access OFF → create profile only (UUID generated, no auth account)
```

### Implementation

**1. Database Migration**
- Add `portal_access BOOLEAN DEFAULT true NOT NULL` to `profiles`
- Drop the FK constraint from `profiles.id → auth.users(id)` (if exists) so profile-only rows are valid
- Set existing placeholder-email users (`%@placeholder-pms.com`) to `portal_access = false`

**2. Edge Function: `create-employee`**
- If `portal_access` is `false` (or no email provided and flag not set):
  - Generate UUID via `gen_random_uuid()`
  - Insert directly into `profiles` — skip `auth.admin.createUser()`
- If `portal_access` is `true`: existing flow unchanged

**3. User Management UI**
- Add "Portal Access" toggle (default ON) in Add New User form
- When OFF: hide email field, show info badge "This user will not have login access"
- In user list: show a "No Portal" badge for `portal_access = false` users
- Allow admin to "upgrade" a data-only user to portal user later (provide email → create auth account)

**4. Employee Import**
- Add optional `portalAccess` column to import template (values: Yes/No, default: Yes)
- When `No`: skip auth account creation during import

**5. Guards & Edge Cases**
- Password reset/rollout: skip users where `portal_access = false`
- Email notifications: already guarded by null email check — no change needed
- Auto-logout hook: only runs for authenticated users — no change needed
- Reports: query `profiles` table — fully unaffected

### Files to Change

| File | Change |
|------|--------|
| **Migration SQL** | Add `portal_access` column, drop FK if exists, backfill placeholder users |
| `supabase/functions/create-employee/index.ts` | Two-path logic: auth+profile vs profile-only |
| `src/pages/admin/UserManagement.tsx` | Portal Access toggle in create/edit form, badge in list |
| `src/pages/admin/ImportData.tsx` | Add `portalAccess` column to template & processing |
| `DOCUMENTATION.md` | Version bump + feature docs |

### Risk Assessment
- **Data Impact**: FK removal is safe — no existing orphan profiles. Column addition is non-destructive.
- **Workflow Impact**: Zero — KPI assignment, reviews, scoring all use `profiles.id`, not auth.
- **Regression Risk**: Low — auth flow is isolated; adding a branch doesn't affect existing path.
- **Security**: Improved — fewer unnecessary auth accounts means smaller attack surface.
- **Rollback**: Column is additive; FK can be re-added if needed.

