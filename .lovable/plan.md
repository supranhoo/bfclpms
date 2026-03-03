

# Fix: Strip Mention UUIDs from Email Notifications

## Problem
When a reply contains an @mention (e.g., `@[Ankit Choudhary](535d9a14-e4aa-4676-af92-f535373ffc8d)`), the raw syntax including the UUID is displayed in the email notification. The UUID should be stripped so the email shows just `@Ankit Choudhary`.

## Root Cause
The edge function receives `reply_content` as-is from the DB trigger and passes it into the email template without converting mention syntax to display text.

## Fix

### File: `supabase/functions/send-email-notification/index.ts`

Add a utility function to strip mention syntax:

```typescript
function stripMentionSyntax(text: string): string {
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
}
```

Apply it to `reply_content` (and `observation_description` for safety) before placing them in `placeholderData`:

```typescript
reply_content: reply_content ? stripMentionSyntax(reply_content) : reply_content,
observation_description: observation_description ? stripMentionSyntax(observation_description) : observation_description,
```

This converts `@[Ankit Choudhary](535d9a14-...)` → `@Ankit Choudhary` in emails.

**1 file change, no DB migration needed.**

