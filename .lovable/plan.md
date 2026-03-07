
# Plan: Active/Inactive Employee Status — IMPLEMENTED ✅

## What Was Done

### 1. Database Migration
- Added `is_active` (boolean, default `true`) and `deactivated_at` (timestamptz) columns to `profiles` table.

### 2. Auth Gate
- `AuthContext.tsx` checks `is_active` on login/session restore. If `false`, user is signed out with a toast notification.

### 3. User Management UI
- **Stats cards**: Now show Total, Active, Inactive, Admins (4 cards).
- **Status filter**: Dropdown (Active/Inactive/All), defaults to "Active".
- **Status column**: Desktop table shows Active/Inactive badge; mobile cards show Inactive badge.
- **Edit dialog**: Account Status switch with description text.
- **Manager dropdowns**: Inactive users are filtered out from edit, create, and bulk update dialogs.

### 4. KPI Rollover
- `auto-rollover-kpis` edge function fetches `is_active` for all employees and skips inactive ones with `status: 'skipped'`.

### 5. Employee Selectors
- `useTeamMembers()` filters to active employees only.
- Manager dropdowns in User Management filter out inactive users.
