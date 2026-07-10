## Problem

When HR/Admin excludes an employee via Bulk Actions, the row is marked `overall_status = 'excluded'` on `annual_review_instances`, but the reviewer's **Team Annual Review** queue still fetches and renders it (screenshot: Santosh Bediya SK376 opens as a normal review with an "Excluded" badge but full submit UI). The exclude was implemented only for the admin/reports surface — the reviewer path was never taught about the new status.

## Root Cause

`listInstancesForReviewerPaginated` (`src/services/annualReview/annualReviewService.ts`) filters by `cycle_id` + reviewer `.or(...)` only — no status exclusion. The single-instance detail fetch (`getInstanceById`) and the RPC that accepts a reviewer submit (`submit_annual_review_stage` / equivalent) also do not check `excluded`. So the row appears in the queue, opens in the detail page, and (unless the DB RPC happens to reject on status) can be submitted.

Prior decision "Excluded rows always visible with a badge" applied to **reports/admin surfaces** (audit view), not to the reviewer's action queue. An excluded employee must not be actionable by any reviewer.

## Risk & Impact

- Data: No schema change. Read-only filter + one RPC guard.
- Workflow: Reviewers stop seeing excluded rows in queue and cannot submit against them. Admin/reports keep the badge (unchanged).
- Regression: Two counters (queue total, "pending" tile) shift down by the excluded count — expected. Deep links to an excluded instance render read-only instead of the submit form.
- Rollback: Purely additive filters; revert the two files + one migration.

## Plan

1. **Reviewer queue filter** — `listInstancesForReviewerPaginated`: add `.neq('overall_status', 'excluded')`. Also update `listInstancesForReviewer` (used by any legacy caller) for parity.
2. **Detail page read-only** — `TeamAnnualReviewDetail` / `TeamReviewDetailContent`: when `instance.overall_status === 'excluded'`, render the header + an "Excluded from this cycle" notice (with `excluded_reason` if present) and hide the submit / send-back / save-draft actions. No form editing.
3. **Server guard (defense in depth)** — Add a status check inside the existing reviewer submit RPC(s): if `overall_status = 'excluded'`, raise `'Instance excluded from cycle'`. Migration only touches the RPC body, no schema change.
4. **Admin/reports untouched** — `AnnualReviewAdmin` progress tab and `/reports/annual-review` continue to show excluded rows with the rose "Excluded" badge (per earlier decision).
5. **Tests** —
   - Unit: `listInstancesForReviewerPaginated` returns 0 rows when the only match is excluded.
   - Unit: detail page renders the excluded notice and does not mount the submit form.
   - RPC test: submit against an excluded instance raises the guard error.
6. **Docs** — POLICY.md: add rule "Excluded instances are hidden from reviewer queues and are non-actionable; they remain visible in admin/reports with an Excluded badge." Add ADR entry linking to the bulk-exclude feature memo.

## Files touched

- `src/services/annualReview/annualReviewService.ts` — add `.neq('overall_status','excluded')` in both reviewer fetchers.
- `src/components/annual-review/TeamReviewDetailContent.tsx` (or `TeamAnnualReviewDetail.tsx`) — early-return excluded notice.
- `supabase/migrations/<new>.sql` — add excluded guard inside the submit RPC(s) used by reviewers.
- `mem/features/annual-review/*` + `POLICY.md` — record the rule.
- Tests under `src/test/` and `supabase/tests/` (if present).

## Out of scope

- Changing how admin/reports render excluded rows.
- Bulk-restore UI (already exists via `restore_annual_review_instance`).