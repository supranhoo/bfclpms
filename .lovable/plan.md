
## RCA

I checked the full path and the KPI names are already being generated correctly before the email is sent:

- The system auto-score request contains `kpi_list` with the real KPI name(s)
- The saved editable template in settings also contains `{{kpi_list}}`
- So the issue is not in grouping or data collection

The break is in the email rendering layer for `system_auto_scored` emails: the final message is using the custom template, but the KPI placeholder is not being expanded before the body HTML is sent. That is why the raw token `{{kpi_list}}` appears in the received email.

There is also a secondary UX gap: the template preview/editor does not currently preview `system_auto_scored` placeholders with sample KPI data, so this kind of issue is easy to miss before sending.

## Implementation plan

### 1. Harden placeholder rendering for System Auto-Score emails
Update `supabase/functions/send-email-notification/index.ts` so `system_auto_scored` always prepares a final plain-text KPI string before template replacement.

Planned logic:
- normalize `kpi_list` into a rendered string every time
- support both array input and string input safely
- also set a single-KPI fallback value such as `kpi_name` from the first KPI for safer template usage
- keep `auto_score_reason` injected the same way

This makes the renderer resilient even when admins edit the template.

### 2. Improve the default System Auto-Score template
Update the default template copy in:
- `supabase/functions/send-email-notification/index.ts`
- `src/components/admin/EmailTemplateEditor.tsx`

So it clearly outputs KPI names instead of depending on ambiguous wording. Example structure:
- greeting
- reason
- KPI name/list section
- closing note

If only one KPI is present, the email should still read naturally.

### 3. Fix preview data in Email Template editor
Update `src/components/admin/EmailTemplateEditor.tsx` preview sample data so:
- `{{kpi_list}}` renders sample KPI names
- `{{auto_score_reason}}` renders sample text

This lets admins catch template issues from the preview itself.

### 4. Redeploy and verify both scenarios
After the fix:
- test one auto-scored KPI email
- test multiple auto-scored KPIs in one consolidated email
- confirm the received mail shows actual KPI names, not `{{kpi_list}}`

## Files to update
- `supabase/functions/send-email-notification/index.ts`
- `src/components/admin/EmailTemplateEditor.tsx`

## No database changes needed
