

## Notify Data Owner AND Employee on Org KPI Send-Back (App + Email)

### Current Gap
When an org KPI is sent back, only the **data owner** gets an app notification. No **email** is sent to anyone, and the **employee** whose KPI was affected gets no notification at all.

### Changes

#### 1. `src/hooks/useSendBackOrgKpiValue.ts` — Add employee notifications + email triggers

After the existing data owner notification block (step 3), add:

**Step 3b — Get affected employees:**
- Query `kpis` table for employees who have this org KPI (matching `category_id`, `kra_name`, `kpi_name`, `is_org_level = true`)
- For each affected employee, insert an app notification (type: `org_kpi_sent_back`, message: "The org-level value for [kpiName] has been sent back...")

**Step 3c — Send emails to data owners:**
- For each data owner, call `supabase.functions.invoke('send-email-notification')` with `event_type: 'org_kpi_sent_back'`, passing `recipient_email`, `recipient_name`, `kpi_name`, `kra_name`, `reason`

**Step 3d — Send emails to affected employees:**
- For each affected employee, call `supabase.functions.invoke('send-email-notification')` with the same event type, including the employee's email and name
- Fetch employee profiles (email, full_name) from the kpis join

#### 2. `supabase/functions/send-email-notification/index.ts` — Update template

The `org_kpi_sent_back` email template already exists. Update it to be context-aware:
- If the recipient is a data owner: "Please review and resubmit the data"
- If the recipient is an employee: "The org-level data for your KPI has been sent back for revision by the reviewer. You will be notified once the data owner resubmits."

Add a `recipient_role` field to the template rendering to distinguish the two cases.

### No database changes needed
All tables (`kpis`, `profiles`, `notifications`, `org_kpi_data_owners`) already exist with the required columns.

### Files Modified
- `src/hooks/useSendBackOrgKpiValue.ts` — add employee app notifications + email triggers for both audiences
- `supabase/functions/send-email-notification/index.ts` — update `org_kpi_sent_back` template for dual-audience messaging

