

## Add Consolidated "System Auto-Scored" Email Notification

### Overview
When admin/system auto-scores KPIs (via Pending Reviews), send **one consolidated email per employee** (and one to their manager) listing all affected KPIs — not one email per KPI.

### Changes

#### 1. Add `system_auto_scored` event type

**`src/hooks/useEmailNotificationSettings.ts`** — Add to union:
```
| 'system_auto_scored'
```

**`src/components/admin/EmailNotificationSettings.tsx`** — Add to `EMAIL_EVENTS` array:
```
{ key: 'system_auto_scored', label: 'System Auto-Score', description: 'Notify employee & manager when system auto-scores KPIs due to overdue review' }
```

#### 2. Add default email template

**`src/components/admin/EmailTemplateEditor.tsx`** — Add to `DEFAULT_TEMPLATES`:
```
key: 'system_auto_scored'
subject: '[PMS] Your KPI(s) Have Been Rated by System'
body:
Dear {{recipient_name}},

Your following KPI(s) for {{review_period}} {{review_year}} have been reviewed by the system due to {{auto_score_reason}}.

{{kpi_list}}

Kindly check your KPIs for more details.
```

**`supabase/functions/send-email-notification/index.ts`** — Add matching entry to `DEFAULT_TEMPLATES` and handle `kpi_list` variable (render as bullet list of KPI names).

#### 3. Send consolidated emails after bulk scoring

**`src/hooks/usePendingSelfReviews.ts`**

**In `useBulkAutoScore` `onSuccess`/after scoring loop:**
- Fetch all scored KPIs with employee details (group by employee_id)
- For each employee: fetch profile (name, email, reporting_manager_id)
- Build `kpi_list` string from all KPI names for that employee
- Send **one** email to employee with `auto_score_reason: "delayed self review"`
- Send **one** email to reporting manager
- All emails fire-and-forget (don't block UI)

**In `useBulkManagerPenalty` after penalty loop:**
- Group penalized KPIs by manager
- Send **one** consolidated email per manager with `auto_score_reason: "delayed team's review"`
- Send **one** email to their reporting manager

#### 4. Key design: consolidation by employee
- Group KPIs by `employee_id` before sending
- Build a bullet-point `kpi_list` variable: `• KPI Name 1\n• KPI Name 2\n...`
- One invocation of `send-email-notification` per recipient, not per KPI

### Files Modified
1. `src/hooks/useEmailNotificationSettings.ts` — add type
2. `src/components/admin/EmailNotificationSettings.tsx` — add event entry
3. `src/components/admin/EmailTemplateEditor.tsx` — add template
4. `supabase/functions/send-email-notification/index.ts` — add default template
5. `src/hooks/usePendingSelfReviews.ts` — add email sending logic after scoring

### No database changes needed.

