---
name: Annual Review Operations
description: Cycle reopen, mid-cycle reviewer reassignment, pagination, and standalone report
type: feature
---
- Pagination: Admin → Progress and `/reports/annual-review` both use `listInstancesPaginated` (pageSize ≤ 100). Search resolves via a `profiles.full_name ilike` pre-fetch (cap 500). Summary cards use `getCycleStatusCounts` (one-column projection).
- Reopen: `closed → active` only via `reopen_annual_review_cycle(cycle_id, reason)` — HR/admin only, reason ≥ 3 chars, audit-logged as `annual_review.cycle_reopened`. UI in Cycles tab.
- Reassignment: `annual_review_assignment_overrides` (instance, role, new_reviewer_id, reason). RPC `reassign_annual_review_reviewer` writes the override AND updates the snapshotted reviewer column on the instance so RLS and queues reflect the change immediately. Override row also stays as the durable record.
- Override precedence: any future reviewer-resolution code path must read from `annual_review_assignment_overrides` first, then fall back to the snapshotted columns on the instance.
- Bulk operations and exports are scoped to the visible page — for wider exports, narrow filters first.
- Draft persistence (ADR-105): `useDebouncedResponseDraft` has NO debounced autosave. Team detail and self-review pages persist only via explicit "Save draft" (`flush`), Submit, Send back, and on-unmount cleanup. A `useUnsavedChanges` guard shows a `beforeunload` warning while `status === 'pending'`. Do not re-introduce `setTimeout(persist, …)` — it races the button and reverts edits on refetch/remount.