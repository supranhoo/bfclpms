# Bulk Review Dashboard — Phase 2 Polish

M1–M5 are shipped (schema, read RPCs, drawer, parallel writes, re-open, E16 auto-revert cron). Two items remain from the memory's "Still pending" list. Both are additive and flag-gated; legacy flows untouched.

## Scope

### 1. Row virtualization on the bulk grid
Replace the plain `<table>` body in `BulkReviewDashboard.tsx` with `@tanstack/react-virtual`. Page size stays 200, so this is forward-cover for when users widen filters or we lift the page cap. Columns stay non-virtualized (only 9, all visible at the current 1364px viewport).

- Add `@tanstack/react-virtual` dependency.
- Switch grid to virtualized rows inside a scroll container (`max-h-[60vh]`).
- Keep checkbox/header/selection/click-to-open semantics identical.
- Preserve variance Δ badge and sticky header.

### 2. HR-PMS override notification
When `bulk_write_stage_scores` writes an `auditor` stage score on a cell whose `hr_pms_score IS NOT NULL`, notify the HR PMS role group that their score was overridden, batched per `batch_id` (one notification per HR PMS recipient per batch, not per cell).

- Extend `bulk_write_stage_scores` RPC: after the loop, when stage = `auditor` and at least one cell had a pre-existing `hr_pms_score`, insert one `notifications` row per active HR PMS user with `type='auditor_override_of_hr'`, `metadata = { batch_id, affected_count, period, year }`, and a deep link to `/review/bulk-scoring?batch=<id>`.
- HR PMS users resolved via `user_roles` where `role = 'hr_pms'` ∩ `profiles.is_active = true`.
- Idempotent — guard by checking the `bulk_review_batches.id` is freshly inserted.

## Technical Details

### Files touched
- `package.json` — add `@tanstack/react-virtual`.
- `src/pages/review/BulkReviewDashboard.tsx` — swap table body for virtualized rows.
- New migration: redefine `public.bulk_write_stage_scores(text, jsonb, text)` with the HR-PMS override notification block at the end. Signature unchanged.
- `mem/features/review/bulk-review-dashboard` — close out the two pending items.

### Out of scope
- No new RPCs, tables, or RLS policy changes.
- Email dispatch — uses the existing `notifications` table; email delivery is already handled by the Notification & Dispatch Engine cron.
- No change to legacy reviewer grids.

## Risk & Impact

| Dimension | Impact | Mitigation |
|---|---|---|
| Data | None — notification inserts only. | Idempotent per batch_id. |
| Workflow | None when flag OFF. | Both changes flag-gated via existing `is_bulk_review_enabled()`. |
| UI/UX | Bulk grid scrolls smoothly at 200+ rows; visual parity. | Preserve all existing classes, header, selection model. |
| Regression | Low — RPC signature unchanged. | Notification block in a `BEGIN … EXCEPTION WHEN OTHERS THEN NULL END` guard so a notification failure never breaks the write. |
| Scalability | Virtualization unblocks future page-size lift; notification block bounded to active HR PMS users (typically < 10). | Bounded fan-out. |
| Rollback | Flip flag OFF; or revert migration (notifications stop, writes continue). | Notification block is a single trailing append. |

## Verification
- Manually scroll the grid at 200 rows — header sticks, selection persists across scroll.
- Trigger an Auditor write over an existing HR PMS score → verify one notification row per active HR PMS user.
- Trigger an Auditor write with NO existing HR PMS score → verify zero notifications.

Ready to implement on approval.