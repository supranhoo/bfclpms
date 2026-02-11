
# Password Policy / Credential Rollout Feature

## Overview
Add a new "Password Policy" tab to System Settings that lets admins identify eligible users (those with KRAs or who manage employees with KRAs), generate secure passwords in bulk, and email credentials -- all with full audit logging.

## Database Changes

### 1. New table: `password_rollout_logs`
Tracks every password generation event for audit purposes.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | auto-generated |
| user_id | uuid | FK to profiles.id |
| employee_code | text | snapshot for audit |
| full_name | text | snapshot for audit |
| email | text | snapshot for audit |
| generated_by | uuid | admin who triggered it |
| email_sent | boolean | whether credential email was dispatched |
| email_error | text | null if successful |
| status | text | 'success' / 'failed' |
| error_message | text | null if successful |
| created_at | timestamptz | default now() |

RLS: admin-only SELECT/INSERT (using `has_role` function).

### 2. New SQL view: `eligible_login_users`
Computes eligibility automatically so the frontend just queries a view.

```text
eligible_login_users = 
  (profiles that have at least one KPI in kpis table)
  UNION
  (profiles that are reporting_manager_id of someone who has KPIs)
```

Returns: id, full_name, email, employee_code, designation, department_id, eligibility_type ('has_kras' | 'reporting_manager' | 'both').

## Backend (Edge Function)

### New function: `password-rollout`
- Accepts: `{ user_ids: string[], send_email: boolean }`
- Admin-only (verified via user_roles)
- For each user:
  1. Generate a 12+ character password (uppercase, lowercase, digits, symbols) using `crypto.getRandomValues`
  2. Call `supabaseAdmin.auth.admin.updateUserById(userId, { password })` 
  3. If `send_email` is true, invoke the existing `send-email-notification` function internally (or send directly via the configured email provider)
  4. Log result to `password_rollout_logs`
- Returns summary: `{ total, succeeded, failed, details[] }`
- Passwords are NEVER stored -- only sent via email and used for the auth update

## Frontend

### New tab in System Settings: "Password Policy"
Added as a 9th tab with a Key/Lock icon.

**Layout:**
1. **Eligibility Filter Bar**
   - Department dropdown filter
   - Eligibility type filter (Has KRAs / Reporting Manager / Both)
   - Search by name/employee code
   
2. **User Selection Table**
   - Checkbox column (select all / individual)
   - Columns: Employee Code, Name, Email, Department, Eligibility Type
   - Pagination
   
3. **Action Bar** (sticky bottom or top)
   - "Generate & Send Passwords" button (primary)
   - "Generate Only" button (secondary -- generates but doesn't email)
   - Selected count badge
   
4. **Confirmation Dialog**
   - Shows count of selected users
   - Toggle: "Send credentials via email"
   - Warning about overwriting existing passwords
   - Proceed / Cancel buttons

5. **Rollout History Card**
   - Table showing recent password_rollout_logs
   - Columns: Date, Admin, Users Count, Status, Email Sent

### Files to create/modify:
- `src/pages/admin/SystemSettings.tsx` -- add 9th tab
- `src/components/admin/PasswordPolicyTab.tsx` -- new component (main tab content)
- `src/hooks/usePasswordRollout.ts` -- new hook (eligible users query, rollout mutation, logs query)
- `supabase/functions/password-rollout/index.ts` -- new edge function
- `DOCUMENTATION.md` -- update with feature docs

## Security Considerations
- Passwords generated server-side only (edge function), never on client
- No plaintext password storage anywhere in the database
- Admin role verified server-side before any operation
- RLS on `password_rollout_logs` restricts to admin role
- Email delivery uses existing TLS-secured email infrastructure
- Audit trail captures who generated passwords and when

## Email Template
A new email event type `password_rollout` will be added to the email template system. The email will contain:
- Employee name
- Login email
- Generated password
- Link to the application login page
- Instruction to change password on first login
