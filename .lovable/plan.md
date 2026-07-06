# Fix: Observation emails show "N/A" for Observation / Type / Description / Reply

## Root cause (verified against DB + edge fn)

- The `notify_on_observation_reply` (and sibling `notify_on_observation_change`) triggers correctly write `observation_title`, `observation_type`, `observation_description`, and `reply_content` into `notifications.metadata` (confirmed on 3 most recent rows — values are populated, not null).
- The edge function `send-email-notification` template `observation_reply` (and `observation_raised` / `observation_mention` / `observation_resolved`) expects these values as **top-level** fields in the request body (`observation_title`, `observation_type`, `observation_description`, `reply_content`) — see index.ts line 1258 destructure.
- The DB dispatcher `public.send_email_on_notification` builds the HTTP body and **never lifts these keys out of `metadata`**. It sends them only nested inside `metadata`, so the top-level destructure resolves to `undefined`, the `{{...}}` placeholders render as empty, and the template renderer's empty-value fallback prints **"N/A"** for every observation field.

Net effect: every observation email — Raised, Reply, Mention, Resolved — shows "N/A" for Observation title, Type, Description and Reply.

## Fix (surgical, single migration)

Update `public.send_email_on_notification` to include the four observation fields at the top level of the outbound JSON body, extracted from `NEW.metadata`:

- `observation_title` → `NEW.metadata->>'observation_title'`
- `observation_type` → `NEW.metadata->>'observation_type'`
- `observation_description` → `NEW.metadata->>'observation_description'`
- `reply_content` → `NEW.metadata->>'reply_content'`

No trigger logic change, no schema change, no edge-function change (the edge fn already handles these correctly, including `stripMentionSyntax` for description/reply).

## Risk & Impact

- **Data**: none — trigger already writes the metadata; we're only lifting keys into the HTTP payload. No table/RLS/schema change.
- **Workflow**: none — same events fire, only email body content changes.
- **UI/UX**: none in-app; email content now shows actual observation title/type/description/reply.
- **Regression**: minimal. The added keys are additive; unrelated event types ignore them. Rollback = re-run prior definition of the function.
- **Scalability**: neutral (four extra JSON keys per notification dispatch).

## Tests / verification

1. Unit test `src/test/emailPayload/observationReplyPayload.test.ts` — reads the migration file and asserts all four keys are present in the `send_email_on_notification` body builder.
2. Manual verification query: after migration, re-trigger an observation reply on a sandbox KPI and confirm the resulting `email_logs.metadata` shows populated `observation_title` / `reply_content`.

## Documentation

- Append entry to `DOCUMENTATION.md` "Version History".
- Add a note to `mem/architecture/notification-and-dispatch-engine` clarifying that any new metadata field consumed by an email template must ALSO be lifted to a top-level body key inside `send_email_on_notification`, otherwise the template renders "N/A".

## Files touched

- `supabase/migrations/<new>.sql` — replace `public.send_email_on_notification` body-builder JSON to include the four observation fields.
- `src/test/emailPayload/observationReplyPayload.test.ts` — new.
- `DOCUMENTATION.md` — version history line.
- `mem/architecture/notification-and-dispatch-engine` — one-line rule.

No frontend code changes.
