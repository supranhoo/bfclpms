

# @Mention System for Observation Replies

## Overview

Add an @mention feature to the observation reply thread so auditors, admins, and other reviewers can tag specific people by name. When someone is @mentioned, they receive an in-app notification that deep-links directly to that observation's KPI.

## How It Works (User Experience)

1. While typing a reply in the observation thread, the user types `@` followed by a name
2. A dropdown autocomplete appears showing matching users (filtered by name/email)
3. Selecting a user inserts their name as a styled @mention tag in the reply text
4. On submit, the system detects all @mentioned users and creates a notification for each
5. Clicking the notification navigates directly to the KPI's observation section

```text
+-----------------------------------------------+
| [Reply box]                                    |
| "I need @Gaurav Budhia to verify this data..." |
|                                                |
|   +---------------------------+                |
|   | Gaurav Budhia             |  <-- dropdown  |
|   | Gaurav Sharma             |                |
|   +---------------------------+                |
|                                                |
| [Post Reply]  [Cancel]                         |
+-----------------------------------------------+
```

## Changes

### 1. New UI Component: `src/components/ui/MentionTextarea.tsx`

A textarea-like component with @mention autocomplete:

- Monitors input for `@` trigger character
- When `@` is typed, opens a floating dropdown (using Popover) showing user matches
- Fetches matching profiles from the `profiles` table filtered by `full_name` or `email` (ILIKE search)
- On selection, inserts `@[Full Name](user_id)` syntax into the text
- Displays @mentions with a highlighted style (bold, primary color)
- Exposes `onMentionsChange(userIds: string[])` callback so parent can track mentioned users
- Props: `value`, `onChange`, `onMentionsChange`, `placeholder`, `rows`, `className`

The mention syntax `@[Full Name](uuid)` is stored in the reply text. A simple regex extracts user IDs on submit.

### 2. New Utility: `src/lib/mentionUtils.ts`

Small utility file with:

- `parseMentions(text: string): { userId: string; displayName: string }[]` -- Extracts all `@[Name](uuid)` from text
- `renderMentionText(text: string): ReactNode` -- Converts mention syntax to styled spans for display
- `insertMention(text: string, cursorPos: number, user: { id: string; name: string }): { newText: string; newCursorPos: number }` -- Handles insertion at cursor position

### 3. Update: `src/components/review/ObservationReplyThread.tsx`

- Replace `<Textarea>` in the reply form with the new `<MentionTextarea>` component
- Track mentioned user IDs via state
- Pass mentioned user IDs to `createReplyMutation` so notifications can be sent

### 4. Update: `src/hooks/useObservationReplies.ts`

- Extend `useCreateObservationReply` mutation to accept `mentionedUserIds: string[]`
- After inserting the reply, insert notification records for each mentioned user:
  - `type: 'observation_mention'`
  - `title: '@Mentioned in Observation'`
  - `message: '[Mentioner Name] mentioned you in an observation on [KPI Name]'`
  - `kpi_id: <kpi_id from observation>`
  - `related_user_id: <reply author>`
  - `metadata: { employee_id, observation_id, ticket_number }`

This uses the existing `notifications` table -- no schema changes needed. The notifications are inserted client-side in the same mutation, following the pattern used in `kraNotifications.ts`.

### 5. Update: `src/lib/inboxUtils.ts` (Navigation)

- Add `observation_mention` to the `getNotificationNavigationPath` switch case
- Deep-link to the KPI with the observation panel open: `/dashboard?kpi={kpiId}&panel=observations` (or team view if for another employee)
- Add `observation_mention` to `getNotificationTypeLabel` for proper inbox display

### 6. Update: Reply Display in `ObservationReplyThread.tsx`

- When rendering `reply.reply_text`, use `renderMentionText()` from mentionUtils to convert `@[Name](uuid)` into styled, highlighted spans
- Mentioned names appear bold with a primary color highlight so they stand out in the thread

### 7. New Hook: `src/hooks/useMentionSearch.ts`

A small hook for the autocomplete:

- Accepts a search query string
- Queries `profiles` table with `full_name.ilike.%query%` or `email.ilike.%query%`
- Returns top 5 matches with `{ id, full_name, email, employee_code }`
- Debounced (300ms) to avoid excessive queries
- Existing RLS on `profiles` ensures users only see profiles they have access to

---

## Technical Details

### Mention Syntax (Stored in DB)

```text
Raw text: "I need @[Gaurav Budhia](uuid-123) to check this value"
Display:  "I need **@Gaurav Budhia** to check this value"
```

This approach:
- Survives edits and re-renders
- Is human-readable even in raw form
- Can be parsed with a simple regex: `/@\[([^\]]+)\]\(([^)]+)\)/g`

### Notification Record

```text
{
  user_id: mentioned_user_id,
  type: 'observation_mention',
  title: '@Mentioned in Observation',
  message: 'Rajesh Kumar mentioned you in observation OBS-00042',
  kpi_id: observation.kpi_id,
  related_user_id: reply_author_id,
  metadata: {
    employee_id: kpi.employee_id,
    observation_id: observation.id,
    ticket_number: observation.ticket_number
  }
}
```

### Deep-Link Flow

```text
Notification Click
  -> getNotificationNavigationPath('observation_mention')
  -> /dashboard?kpi={kpiId} (self) or /dashboard?view=team&employee={empId}&kpi={kpiId} (reviewer)
  -> Dashboard opens KPI review panel -> scrolls to observations section
```

### Data Flow

```text
User types "@Gau" in reply
  -> useMentionSearch("Gau")
  -> SELECT id, full_name, email FROM profiles WHERE full_name ILIKE '%Gau%' LIMIT 5
  -> Dropdown shows matches
  -> User selects "Gaurav Budhia"
  -> Text becomes: "I need @[Gaurav Budhia](uuid) to verify"
  -> On submit:
      1. Insert reply into kpi_observation_replies
      2. Parse mentions from text
      3. Insert notification for each mentioned user
      4. Auto-acknowledge observation (existing behavior)
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/mentionUtils.ts` | Create | Parse, render, and insert @mention syntax |
| `src/hooks/useMentionSearch.ts` | Create | Debounced profile search for autocomplete |
| `src/components/ui/MentionTextarea.tsx` | Create | Textarea with @mention autocomplete dropdown |
| `src/hooks/useObservationReplies.ts` | Update | Add mentionedUserIds param, insert notifications |
| `src/components/review/ObservationReplyThread.tsx` | Update | Use MentionTextarea, display formatted mentions |
| `src/lib/inboxUtils.ts` | Update | Add observation_mention navigation + label |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | None | No schema changes; uses existing notifications and profiles tables |
| Security | Low | Profile search respects existing RLS; notifications only created for valid user IDs |
| Performance | Low | Debounced search, limited to 5 results; no heavy queries |
| Regression | None | Existing reply flow unchanged; mention is additive |
| Spam | Low | Notifications only sent on reply submit, not on typing; duplicate mentions to same user deduplicated |

