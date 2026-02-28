

# @Mention Enhancements: Observation Dialog, Email Notifications, and UI Polish

## 1. Add @Mention Support in Observation Title and Description

Replace the plain `<Input>` (title) and `<Textarea>` (description) in `AddObservationDialog.tsx` with `MentionTextarea` so users can @mention people when creating or editing observations.

### Changes to `src/components/review/AddObservationDialog.tsx`
- Replace `import { Input }` and `import { Textarea }` with `import { MentionTextarea }`
- Add `mentionedUserIds` state to track all mentioned users across both title and description fields
- Replace the title `<Input>` with a `<MentionTextarea rows={1}>` (single-line feel)
- Replace the description `<Textarea>` with a `<MentionTextarea rows={3}>`
- Parse mentions from both title and description on submit
- Import `parseMentions` from mentionUtils

### Changes to `src/hooks/useKpiObservations.ts`
- Update `useCreateObservation` mutation to accept optional `mentionedUserIds: string[]`
- After inserting the observation, insert `observation_mention` notifications for each mentioned user (same pattern as in `useObservationReplies.ts`)
- Update `useUpdateObservation` similarly to handle mentions on edit

---

## 2. Add Email Notifications for @Mentions

Currently the `send_email_on_notification` database trigger maps notification types to email event types. We need to add `observation_mention` to this pipeline.

### Changes to `send_email_on_notification` DB function (migration)
- Add a new `WHEN 'observation_mention' THEN mapped_event_type := 'observation_mention';` case to the trigger's CASE statement

### Changes to `supabase/functions/send-email-notification/index.ts`
- Add `observation_mention` to the default email templates:
  - Subject: `[PMS] You were mentioned in an Observation`
  - Body: Template with `{{actor_name}}`, `{{kpi_name}}`, `{{observation_title}}` placeholders
- Add `observation_mention` to the email styling map with a distinctive color/emoji (e.g., `{ color: '#3b82f6', emoji: '@', title: 'Mentioned in Observation' }`)

---

## 3. Polish the Reply Placeholder Text

The current placeholder `"Write a reply... Use @ to mention someone"` feels heavy. Change it to a lighter, more subtle hint.

### Change in `src/components/review/ObservationReplyThread.tsx`
- Update placeholder to: `"Write a reply — @ to mention"`

This is shorter, uses an em-dash for visual lightness, and removes redundant words.

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/review/AddObservationDialog.tsx` | Update | Replace Input/Textarea with MentionTextarea for title and description |
| `src/hooks/useKpiObservations.ts` | Update | Add mention notification logic to create/update observation mutations |
| DB migration | Create | Add `observation_mention` case to `send_email_on_notification` trigger |
| `supabase/functions/send-email-notification/index.ts` | Update | Add `observation_mention` email template and styling |
| `src/components/review/ObservationReplyThread.tsx` | Update | Lighten placeholder text |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | None | No schema changes; uses existing notifications table |
| Regression | None | Existing observation create/edit flow preserved; mention is additive |
| Email | Low | Follows established pattern for observation email events |
| UI | None | MentionTextarea is a drop-in replacement with same sizing props |

