

## Monthly Self-Review & Team KRA Review Reminder Email (Revised)

### Overview
Scheduled edge function on 1st of every month at 8 AM. Sends a general reminder to all employees with active KRAs for **last month** (e.g., if triggered on 1st April 2026, review period = "March", year = 2026). No pending KPI table — just a common motivational reminder.

### Review Period Logic
- **Month**: Previous calendar month (e.g., triggered April 1 → "March")
- **Year**: Current calendar year

### Email Content

**Subject:** `[PMS] Monthly Reminder: Complete Your Self-Review & Team KRA Review — {{last_month}} {{current_year}}`

**Body:**
```
Dear {{employee_name}},

This is a friendly reminder that KRAs for {{last_month}} {{current_year}} require your attention.

📋 Self-Review
Please log in and complete your self-assessment for any pending KPIs at your earliest convenience.

👥 Team KRA Review (If Applicable)
If you are a reporting manager, kindly review your team members' KPIs to ensure timely feedback and keep the review cycle on track.

Timely completion of reviews helps maintain a smooth and transparent appraisal process for everyone.

Best regards,
{{company_name}} PMS System
```

### Implementation

**1. New Edge Function: `supabase/functions/send-monthly-review-reminder/index.ts`**
- Compute last month name + current year
- Query all employees from `profiles` who have at least one KPI for that period (distinct `employee_id` from `kpis` where `review_period = lastMonth` and `review_year = currentYear`)
- Check `email_notifications_enabled` and `monthly_review_reminder` event enabled
- Send the same common email to each employee via `send-email-notification`
- No pending KPI table in email body

**2. New event type: `monthly_review_reminder`**
- Add to `EmailEventType` in `useEmailNotificationSettings.ts`
- Add to `EMAIL_EVENTS` array in `EmailNotificationSettings.tsx`
- Add template in `send-email-notification/index.ts` DEFAULT_TEMPLATES

**3. Cron job** — `0 8 1 * *` (1st of every month at 8 AM UTC)

**4. Config** — Add function block in `supabase/config.toml`

**5. Docs** — Update `DOCUMENTATION.md` and `POLICY.md`

### Files
1. **NEW**: `supabase/functions/send-monthly-review-reminder/index.ts`
2. **MODIFY**: `supabase/functions/send-email-notification/index.ts` — add template
3. **MODIFY**: `src/hooks/useEmailNotificationSettings.ts` — add event type
4. **MODIFY**: `src/components/admin/EmailNotificationSettings.tsx` — add toggle
5. **DB**: pg_cron schedule via SQL insert
6. **MODIFY**: `DOCUMENTATION.md`, `POLICY.md`

### Risk Assessment
- **Data Impact**: None — read-only queries
- **Workflow Impact**: None — additive notification
- **Regression Risk**: Zero — new function + event type

