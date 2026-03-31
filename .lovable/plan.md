

## Plan: Add Monthly Review Reminder to Email Templates UI

### Problem
The `monthly_review_reminder` event type exists in the edge function (`send-email-notification/index.ts`) and in the notification settings toggle (`EmailNotificationSettings.tsx`), but it is missing from the `DEFAULT_TEMPLATES` array in `EmailTemplateEditor.tsx`. This is why it does not appear in the Email Templates list alongside the other 25 templates.

### Changes

**`src/components/admin/EmailTemplateEditor.tsx`**
- Add a new entry to the `DEFAULT_TEMPLATES` array (after `system_auto_scored`, before the closing `]`) with:
  - `key: 'monthly_review_reminder'`
  - `label: 'Monthly Review Reminder'`
  - `description: 'Sent on alternate dates (1st, 3rd, 5th, 7th, 9th) of each month to remind employees to complete self-review & team KRA review'`
  - Default subject and body matching the template already defined in the edge function
  - `color: '#3b82f6'`, `emoji: '📋'`
- Add monthly-reminder-specific placeholders to the `PLACEHOLDERS` array:
  - `{{pending_kpis_count}}` — Number of pending KPIs
  - `{{pending_kpis_list}}` — List of pending KPI names

**`DOCUMENTATION.md`** — v2.15.14 changelog

### Risk Assessment
- **Regression**: Zero — additive only, appending one entry to an existing array
- **Data**: No schema changes; uses existing `system_settings` persistence pattern (`email_template_monthly_review_reminder`)

