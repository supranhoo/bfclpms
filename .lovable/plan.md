## Issue
The "Current:" line in the Reassign Reviewer dialog shows a raw UUID (`f6d569ad-a5ce-...`) instead of the reviewer's name — unreadable for HR users.

## Fix (UI-only, `src/components/annual-review/ReassignReviewerDialog.tsx`)

1. Resolve the current reviewer's display name via a lightweight query:
   - When `currentReviewerId` is set, fetch `{ id, full_name, employee_code }` from `profiles` (single-row, cached by id, `staleTime: 5min`).
   - Reuse it if the person already appears in the `people` search result list to skip the extra fetch.

2. Render:
   - `Current: <Full Name> (<employee_code>)` when resolved
   - `Current: — none —` when the slot is unmapped
   - `Current: Loading…` while the name query is in flight
   - Drop the monospaced UUID entirely.

3. Keep the `newReviewerId !== currentReviewerId` guard unchanged (still compares by id under the hood).

## Not changing
Reassign RPC, override table, role list, search behavior, or any business logic. Purely presentational.

## Risk
Minimal — one added `useQuery` keyed on `currentReviewerId`, gated by `open`. No schema, RLS, or workflow impact.
