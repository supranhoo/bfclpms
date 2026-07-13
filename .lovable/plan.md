## Root cause

Shailesh Singh (200511) is on `pending_self` for his annual-review instance, but the row in `annual_review_responses` for `reviewer_role='self'` has `reviewer_id = Prakash Chandra Goswami (200549)` — a proxy who opened/drafted the self review on his behalf (Admin View / assisted flow).

That combined with schema + RLS locks the employee out:

1. `UNIQUE (instance_id, reviewer_role)` — only one `self` row per instance can exist.
2. RLS `responses_select_visible` lets the employee see the row only if `reviewer_id = auth.uid()` OR the instance is `completed`. While `pending_self` with a proxy-owned row, the employee **cannot even SELECT** the draft.
3. RLS `responses_self_update` allows update only if `reviewer_id = auth.uid()` OR caller is a valid proxy. The actual employee is neither, so UPDATE is blocked.
4. His UI therefore sees "no draft" and attempts an INSERT, which fails on the unique constraint. Result: nothing saves, self review can't be filled.

This is systemic — a query across the active cycle shows **many** `pending_self` instances whose `self` row is owned by a proxy (managers/admins), so the same lockout affects a large batch of employees, not just Shailesh.

## Risk & impact

- Data: no destructive change. Draft self responses touched only where `submitted_at IS NULL` AND `overall_status='pending_self'`. Submitted / advanced rows are untouched.
- Workflow: unchanged — status stays `pending_self`, chain stays `self → bu_head`.
- Security: SELECT/UPDATE policies broadened only for the reviewee on their own instance while `overall_status='pending_self'` and `is_locked=false`. Proxy submission stays fully supported.
- Regression risk: low; scoped predicate (`reviewer_role='self'` + own instance + pending_self + unlocked).
- Rollback: migration keeps prior policies in a comment block; a follow-up migration can restore them, and the data repair only rewrites `reviewer_id` on unsubmitted self drafts (idempotent).

## Fix (3 parts, one migration + one small hook change)

### 1. Data repair (one-shot, in migration)
For every response row where:
- `reviewer_role = 'self'`
- `submitted_at IS NULL` AND `is_locked = false`
- parent instance `overall_status = 'pending_self'`
- `reviewer_id <> instance.employee_id`

reassign `reviewer_id := instance.employee_id`. Log each rewrite into `annual_review_head_remap_audit_YYYY_MM` (reuse existing audit table pattern) with reason `self_proxy_draft_reassigned_v1`. Preserves the draft content the proxy typed so nothing is lost; hands ownership back to the employee.

### 2. RLS adjustment
Add two narrow predicates:

- `responses_select_visible`: also allow when
  `reviewer_role='self' AND EXISTS(instance where employee_id=auth.uid() AND overall_status='pending_self')`.
- `responses_self_update`: also allow when
  `reviewer_role='self' AND is_locked=false AND EXISTS(instance where employee_id=auth.uid() AND overall_status='pending_self')`.

Effect: while a self review is legitimately open, the reviewee can always read + edit their own self row regardless of who last touched it. Nothing changes once the instance advances past `pending_self`.

### 3. Client hardening (`useAnnualReviewSelfDraft` / self-review save path)
On save, force-write `reviewer_id = user.id` in the upsert payload for `reviewer_role='self'` (currently it re-uses whatever came back on read). This prevents a future proxy save from re-orphaning the row.

No UI redesign, no workflow logic change.

## Tests

- `src/test/annualReview/selfDraftProxyLockout.test.ts` — unit test for the SELECT + UPDATE predicate matrix (employee, proxy, admin, HR PMS, unrelated user × pending_self / pending_bu / completed).
- SQL smoke in the migration: assert that after repair, no `pending_self` instance has a `self` row with `reviewer_id <> employee_id AND submitted_at IS NULL`.

## Docs / policy sync

- `POLICY.md` §AR-SELF-DRAFT-OWNERSHIP (new): "Self-review draft rows MUST always be owned by the reviewee; proxy assistance updates content but never transfers ownership. RLS guarantees the reviewee can read + edit their own self draft while `overall_status='pending_self'`."
- `DOCUMENTATION.md` — version bump + entry describing the lockout RCA, data repair, RLS extension, and client fix.
- `mem://features/annual-review/assisted-submission` — append a note that proxy save must never rewrite `reviewer_id` away from the reviewee.

## Files touched

- `supabase/migrations/<ts>_annual_review_self_draft_ownership.sql` (new): data repair + policy replace + audit rows.
- `src/hooks/useAnnualReviewSelfDraft.ts` (or the equivalent self-save site — I'll confirm the exact file when implementing): force `reviewer_id = user.id` on upsert.
- `src/test/annualReview/selfDraftProxyLockout.test.ts` (new).
- `POLICY.md`, `DOCUMENTATION.md`, memory file above.

Ready to implement on approval.