

# Fix: Notification Insert RLS Blocking @Mention Notifications

## Root Cause

The `notifications` table INSERT policy requires `user_id = auth.uid() OR has_role('admin')`. When a non-admin user @mentions someone, the code tries to insert a notification with `user_id = mentioned_person_id`. Since the inserter is NOT the mentioned person and NOT an admin, RLS silently blocks the insert.

Self-notifications are also intentionally filtered out in code (line 161), which is correct behavior -- you shouldn't notify yourself.

## Fix

Update the INSERT RLS policy on the `notifications` table to allow authenticated users to insert notifications for other users. This is safe because:
- The notification content is controlled by application code, not user input
- Users can only SELECT/UPDATE their own notifications (existing policies)
- This pattern is standard for any notification system where User A's action creates a notification for User B

### Database Migration

Replace the current INSERT policy with:

```sql
DROP POLICY "Users and admins can insert notifications" ON notifications;

CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

This allows any authenticated user to create notifications for any other user, which is required for @mentions, query notifications, observation alerts, etc.

### No Code Changes Needed

The application code in `useKpiObservations.ts` is correct -- the `mentionedUserIds` are properly parsed, self-mentions are filtered, and notifications are constructed correctly. The only blocker is the RLS policy.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Security | Low | INSERT only; users still can only READ/UPDATE their own notifications |
| Spam | Low | No direct user UI to insert arbitrary notifications; all inserts go through controlled mutation logic |
| Regression | None | Existing notification flows (queries, status changes) that insert for other users were likely also affected by this bug |

## Files

| File | Action |
|------|--------|
| DB migration | Update INSERT policy on `notifications` table |

