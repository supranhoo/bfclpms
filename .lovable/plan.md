

## Fix: Differentiate Manager vs Employee Email for System Auto-Score

### Problem
When system auto-scores KPIs, the manager receives the same email as the employee — "Your KPI(s) Have Been Rated by System" — which is incorrect. The manager should see the employee's name in both subject and body.

### Root Cause
The `sendConsolidatedAutoScoreEmails` function passes `employee_name` to the manager email, but the edge function template doesn't use it. Both employee and manager get the exact same subject and body.

### Fix

#### 1. Edge function: `supabase/functions/send-email-notification/index.ts`
- When `event_type === 'system_auto_scored'` and `employee_name` is present (manager scenario), dynamically override the subject and body:
  - **Subject**: `[PMS] KPI(s) of {{employee_name}} Have Been Rated by System`
  - **Body**: Change "Your following KPI(s)" → "The following KPI(s) of your team member {{employee_name}}"
- When `employee_name` is absent (employee scenario), keep current template as-is.
- This override happens after loading the saved/default template but before placeholder replacement, so admin-edited templates for the employee view are preserved.

#### 2. Template editor: `src/components/admin/EmailTemplateEditor.tsx`
- Add `{{employee_name}}` to the available placeholders list for `system_auto_scored` so admins know it's available.

### No database changes needed.

