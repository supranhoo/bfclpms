## RCA — HR Sandeep cannot fill assisted self-review for emp 200044 (Rojid Ansari)

### What the DB says

**Instance `7b962b60-…` (Rojid Ansari, 200044)**
- `overall_status = not_started`  ← the blocker
- `template_id`, `enabled_stages`, `manager_id`, `dept_head_id` all populated correctly
- Employee has email (`rojid1970@gmail.com`) but `auth.users.last_sign_in_at IS NULL` → non-login employee (proxy-eligible in principle)
- Cycle `Annual Review 2025-2026` is `active`, `self_review_start = 2026-07-07` (5 days ago)

**Compared to a working case (`1ab610a9`, Sourabh 101790, same cycle)** — identical shape except `overall_status = pending_self`. Sandeep's HR assisted form works there.

### Root cause

Two gates independently require `pending_self`:

1. `stageForReviewer.ts` maps `pending_self` → self role. `not_started` → returns null → **Read-only view** is rendered.
2. `TeamReviewDetailContent.tsx` line 124: `proxyMode = !stageRole && instance.overall_status === 'pending_self' && proxyEligible === true` → false when status is `not_started`, so "Verify & Submit on behalf" button never renders.
3. Even if the UI let him through, RPC `can_proxy_submit_annual_review` returns false early: `IF v_status <> 'pending_self' THEN RETURN false`.

So the assisted flow is correctly locked — but the *pre-condition* (open self-review stage) never fired for this instance.

**Why the status is stuck:** 21 instances in this cycle are still `not_started` while 1,916 peers correctly moved to `pending_self`. These 21 were seeded (or re-seeded) **after** the cycle's initial "release for self-review" bulk transition ran on `self_review_start = 2026-07-07`. There is no automatic transition that catches instances born *after* that date, and no admin UI action to open self-review for a specific cohort — so late seeds sit at `not_started` indefinitely.

Affected employees (21) — all in the same cohort, e.g.
Rojid Ansari (200044), Ankit Kumar (200713), Shashi Karmali (200770), Sandeep Kumar Verma (200755), Rakesh Kumar (200091), Vinod Tiwari (200090), Mukesh Kumar (200089), … (full list in the query result).

### Risk & impact report

| Dimension | Assessment |
|---|---|
| Data | Only `annual_review_instances.overall_status` flips `not_started` → `pending_self`. No scores touched. Reversible. |
| Workflow | Unlocks self / assisted-self stage for the 21 employees. Downstream reviewer chain already correct. |
| RLS / security | No policy changes. Existing self / proxy checks continue to gate writes. |
| Regression | Low — the update is scoped by `cycle_id`, `overall_status='not_started'`, and the cycle already being past `self_review_start`. |
| Rollback | `UPDATE ... SET overall_status='not_started' WHERE id = ANY(:ids)` if needed. IDs will be captured in an audit row before the flip. |
| Backup | No table added/removed. Existing coverage unaffected. |

### Fix plan

**Part A — one-off data repair (data migration, `insert` tool)**
1. Snapshot the 21 target IDs into `system_audit_logs` (action `AR_OPEN_SELF_LATE_SEED`, metadata = { cycle_id, instance_ids[], performed_by = NULL }) so the change is auditable and rollback-able.
2. `UPDATE annual_review_instances SET overall_status='pending_self', updated_at=now() WHERE cycle_id='b82a935f-…' AND overall_status='not_started'`.
3. Verify: expect 0 rows remaining in `(cycle, not_started)` and 1,937 rows in `(cycle, pending_self)`.

After this, Sandeep's HR assisted form will render for Rojid and the other 20.

**Part B — prevent recurrence (schema migration)**
Add DB function `public.open_self_review_for_pending(_cycle_id uuid) RETURNS int` (SECURITY DEFINER) that:
- Flips any `annual_review_instances` for the given cycle from `not_started` → `pending_self` **only when** `annual_review_cycles.self_review_start <= now()` and the cycle `status='active'`.
- Writes an audit row per flipped instance.

Wire it in two places:
1. **Automatic:** call it at the end of `seedInstancesByRules` / `writeSeedRowsPreservingOverrides` in `annualReviewService.ts` so any late-seed batch is auto-opened.
2. **Admin UI:** new button "Open self-review for pending" on the same Admin → Annual Review → Progress screen (next to "Resync reviewers from master"). Calls the same RPC. Idempotent and safe to press repeatedly.

### Tests

- `src/test/annualReview/openSelfLateSeed.test.ts` — new
  - Late-seeded instance with cycle already past `self_review_start` → status flips to `pending_self`.
  - Cycle not yet started → status stays `not_started`.
  - Cycle `closed` → no-op.
  - Instance already `pending_manager` → untouched.
- Extend `resyncReviewers.test.ts` to assert combined flow: resync + open-self are order-independent.
- Regression asserting `can_proxy_submit_annual_review` returns `true` for HR user + `pending_self` employee-with-no-signin, `false` for `not_started`.

### Documentation updates
- `DOCUMENTATION.md`: new "Late-seed self-review opener" section under Annual Review.
- `POLICY.md`: new clause **§AR-SELF-OPEN-LATE** — instances seeded after cycle `self_review_start` must be auto-opened; admin has an idempotent manual opener; scores/reviewer routing untouched by this transition.
- ADR entry appended to `docs/adr/ADR-annual-review.md` under Consequences.

### Clarifying question before I execute
Do you want me to:
- **(a)** run only Part A (immediate fix for the 21 employees so HR can start filling today) and defer Part B to a follow-up, or
- **(b)** run Part A + Part B together in this turn?

Recommendation: **(b)** — Part B is small, prevents this exact ticket from re-opening every time HR seeds a late joiner, and shares the audit trail with Part A.