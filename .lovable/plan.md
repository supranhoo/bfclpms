# Mail for "@Mentioned in Observation"

## Assumptions

- The in-app notification for mentions already exists and works (`observation_mention`). What is missing is the **email** reaching the mentioned person, plus admin control over it.
- Recipients are only the users explicitly @mentioned (never the whole thread), one email per mentioned user, and never to the person who wrote the mention.

## RCA — why no mail is going out today

The backend chain is already complete:

- The mention writes a `notifications` row of type `observation_mention` with observation title, type and description in metadata.
- The database bridge (`send_email_on_notification`) already maps `observation_mention` to the email event of the same name and posts it to the email function.
- The email function already ships a built-in subject/body for `observation_mention`.

The break is in the **admin surface**: `observation_mention` was never added to the Notification Events list or the Email Templates list. Because the email function only sends events that appear in the saved "enabled events" setting, every mention email is silently skipped and logged as `skipped — event type not enabled`. No code path can ever turn it on today.

## What will change

### 1. Notification Events (Email Notifications settings)
Add a new toggle:

- **Mentioned in Observation** — "Notify a user by email when someone @mentions them in an observation."

Placed with the other observation rows (Raised / Reply / Resolved / Mentioned). Once ticked and saved, mention emails start flowing; unticked keeps today's behaviour.

### 2. Email Templates
Add an editable `observation_mention` template card, same as the other observation templates, with:

- Accent colour + `@` icon, label **Mentioned in Observation**
- Subject: `[PMS] {{actor_name}} mentioned you in an observation — {{kpi_name}}`
- Body with greeting, who mentioned them, KPI, period, observation title / type / description, and a prompt to open the thread
- Reset-to-default, live preview, and the per-template **send schedule** (immediate vs scheduled time) that every other template already supports

### 3. Email Logs
Add the friendly label so mention sends/skips read as "Mentioned in Observation" instead of a raw key.

## Technical details

- `src/hooks/useEmailNotificationSettings.ts` — add `'observation_mention'` to the `EmailEventType` union.
- `src/components/admin/EmailNotificationSettings.tsx` — add the event row to `EMAIL_EVENTS`.
- `src/components/admin/EmailTemplateEditor.tsx` — add the template entry to `DEFAULT_TEMPLATES` (key `observation_mention`), so it persists to `system_settings.email_template_observation_mention` and reuses the existing schedule hook.
- `src/pages/admin/EmailLogs.tsx` — add the label mapping.
- `supabase/functions/send-email-notification/index.ts` — keep the existing default body but align its placeholders with the new template; the event meta entry already exists. Redeploy the function only if its file changes.
- No schema, RLS, trigger, or notification-permission change: the guard, the bridge trigger, and the metadata payload already cover mentions.

## Risk & impact

- **Data:** none — no schema or migration.
- **Workflow:** additive; disabled by default until an admin enables the event.
- **Regression risk:** low; changes are list entries plus one template constant. No shared send path is modified.
- **Volume:** one email per mentioned user per mention, bounded by mention count; respects the existing inactive-user suppression and per-template scheduling/queue.
- **Rollback:** untick the event in Notification Events, or revert the list entries.

## Verification

- Unit test asserting `observation_mention` is present in the events list, the template registry, and the `EmailEventType` union (guards against the same drift that caused this bug).
- Manual: enable the event, @mention a test user in an observation, confirm the mail arrives and Email Logs shows `sent` rather than `skipped`.
- DOCUMENTATION.md + POLICY.md updated with the new ADR (`§OBS-MENTION-EMAIL`) covering the registry-parity rule: every notification type that maps to an email event must appear in both admin lists.
