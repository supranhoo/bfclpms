

# Widen MentionedKpiSheet and Enable Reply Capability

## Changes

### File: `src/components/review/MentionedKpiSheet.tsx`

**1. Widen the sheet** — Change `sm:max-w-2xl` to `sm:max-w-4xl` on the `SheetContent` className (line 89). The current 2xl (672px) truncates the two-column KpiReviewPanel layout; 4xl (896px) gives the Review Journey and Metrics columns proper breathing room.

**2. Pass `currentUserId` to `KpiReviewPanel`** — The panel needs this to correctly identify the logged-in user for reply threads. Import `useAuth`, get the current user, and pass `currentUserId={user?.id}` to the panel (line 126-134). This ensures the `ObservationReplyThread` recognizes the mentioned user and enables the Reply button (the `isReadOnly={false}` path is already active in `KpiObservationsSection`).

Two lines changed, one import added. No database or RLS changes needed — reply INSERT policy already allows any authenticated user (`auth.uid() = reply_by`).

