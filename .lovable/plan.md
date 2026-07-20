
## Verified facts (from DB, not assumed)

- Two `manual` System-KPI slots are involved: `sys_3jsce5p` (Annual Production Target vs Actual) and `sys_2z4e0vw` (Annual PM Target vs Actual). Slot IDs are stable across all 49 templates that carry them — no key drift.
- Across the FAD family the two slots are present on the template for **FAD-E And I** (19), **FAD-Mech** (66), and **FAD-Production** (333 incl. 71 `excluded`). They are **not present** on the FAD-Metal Handling, FAD-Pollution, FAD-RMH, and part of FAD-E And I / FAD-Mech / FAD-Production templates (see table below).
- Existing coverage (raw values already persisted) matches the last successful upload pass — 342 FAD instances already have both values, 71 excluded FAD-Production are intentionally empty, and roughly **~55 FAD instances that carry the slots are still blank** (mostly `pending_bu` E And I and a handful of `pending_self` / `pending_dept` rows).
- Uploader bug: `SystemScoresUploadDialog.tsx` writes the HR-entered raw value straight into `system_scores` (points), never into `system_scores_raw`, and never routes it through `scoreFromRaw` / `pickBand`. That contradicts **ADR-116 / POLICY §AR-SYSTEM-SCORES-KEY-STABILITY** (raw is SSOT). It is the reason your Excel numbers "just disappeared" for some employees: the value overwrites a stale computed point but doesn't survive a template refresh or remap.

Templates without the two slots (per FAD sub-department, `pending_*` only — excluded/completed skipped):

| Sub-department | Status | Count |
|---|---|---|
| FAD-E And I | pending_bu | 8 |
| FAD-Mech | pending_self / pending_dept | 4 |
| FAD-Metal Handling | pending_self / pending_dept | 21 |
| FAD-Pollution | pending_self / pending_dept | 23 |
| FAD-Production | pending_self / pending_dept | 3 |
| FAD-RMH | pending_dept | 14 |

## Assumptions

- "Entire FAD" = every FAD-* sub-department where the employee's review is still live (`overall_status IN ('not_started','pending_self','pending_manager','pending_dept','pending_bu','pending_hr','pending_management')`).
- `excluded` FAD-Production (71) rows are intentionally out of scope. Confirm if you actually want them backfilled.
- For FAD-* rows on templates that **don't** expose the two slots today, I'll flag them in the dry-run report; adding the slots is a template edit and needs your explicit go-ahead per department (I won't silently add scoring items).

## Risk & Impact Report

- **Data**: writes to `system_scores_raw` + `system_scores` for ~55 in-scope FAD instances. Every write audit-trailed in `annual_review_rescore_audit_2026_07`. FAD-Production already has 15 `pending_bu` rows populated — those will not be rewritten unless the current raw differs from 98/100.
- **Workflow**: no status transitions; no reviewer notifications; no cycle changes.
- **UI/UX**: System Scores card for affected FAD employees will render the 98% → rating and 100% → rating derived via the template's library rules.
- **Regression risk**: uploader-fix is scoped to `SystemScoresUploadDialog.tsx` — the derivative path already used elsewhere (`upsertSystemScoresRaw` in `cycleBulkDataUpload.ts`) is the reference. Existing tests in `systemKpiScoring.test.ts` pin the raw→points behaviour.
- **Scalability**: single-shot RPC over ~55 rows; O(rows) with two JSONB merges each. Negligible.
- **Rollback**: RPC is dry-run by default; the audit table stores previous JSONB so a reversal query is a one-liner if needed.

## Step-by-step Plan

1. **New SECURITY DEFINER RPC** `admin_backfill_annual_review_manual_scores(cycle_id uuid, filter jsonb, entries jsonb, dry_run boolean)`:
   - `filter` supports `{ department_name_prefix: 'FAD-', include_statuses: [...], skip_excluded: true }`.
   - `entries` = `[{ library_key: 'annual_production', raw: 98 }, { library_key: 'annual_pm', raw: 100 }]`.
   - Per matched instance: resolve the two slots by `library_key` on the resolved template (`template_override_id ?? template_id`), copy the library `scoring_rules` + `weight_pct`, compute `rating`/`points` in-DB (same math as `scoreFromRaw`), merge into `system_scores_raw` and `system_scores`, and — only when `overall_status IN ('completed','acknowledged')` — recompute `total_score` per the finalization formula. Skip `excluded`.
   - Emit one `annual_review_rescore_audit_2026_07` row per instance capturing before/after JSONB and formula inputs.
   - Return `{ dry_run, matched, would_update, skipped_no_slot, skipped_excluded, skipped_same_value }`.
   - `has_role(auth.uid(), 'admin')` OR `has_role(auth.uid(), 'hr_pms')` gate.
   - **Verification**: unit tests + one dry-run call from a small admin UI button; sample 3 FAD sub-departments and confirm counts.

2. **Uploader bug fix** in `SystemScoresUploadDialog.tsx`:
   - Rewrite the import path to write **raw** values, using `scoreFromRaw` + the resolved library rule to derive `points`, mirroring `cycleBulkDataUpload.parseAndDryRun`.
   - Reject silently-blank cells for `source: 'manual'` slots with a per-row warning banner ("2 employees have an empty Annual Production value — leave blank to keep the previous value, enter 0 to zero it").
   - Enforce the existing `STAGE_SAFE` guard (unchanged) so full-workbook uploads can't overwrite finalized totals — the new manual-only backfill RPC is the only path allowed to touch completed rows.
   - **Verification**: new unit tests in `src/test/annualReview/systemScoresUploadDialog.parse.test.ts` for the raw/points split and the empty-cell warning.

3. **FAD one-shot backfill** driven from the same dialog:
   - New "FAD department backfill (98% / 100%)" section, admin-only, calls the RPC in dry-run first, shows a per-employee preview (Employee Code, Full Name, Sub-dept, current raw, next raw, status, action) with the missing-slot rows highlighted and skipped, then requires a typed confirmation ("BACKFILL FAD") before the commit call.
   - **Verification**: dry-run against production shows 55± touched, 0 skipped-excluded outside FAD-Production/71, 0 missing-slot rows. Then commit → recheck sample: Atul Singh (200414), Anshu Mishra (200222), Ujjwal Chauhan (200408) show 98/100 with derived ratings.

4. **Silent-blank health strip on bulk uploader** (guardrail against recurrence):
   - Extend `cycleBulkDataUpload.parseAndDryRun`'s existing report with `emptyManualColumns[]`. UI adds a red strip when any `source: 'manual'` cell is empty on a row whose template exposes that slot.
   - **Verification**: unit test with a fixture that leaves the two columns blank and expects the strip to fire.

5. **Docs & Policy**:
   - ADR-123 — "Manual-source system-KPI backfill after finalization" (RPC contract, audit obligations, STAGE_SAFE separation).
   - POLICY.md — new §AR-MANUAL-BACKFILL (admin-gated, must rescore + audit, raw is SSOT).
   - DOCUMENTATION.md — v2.66.119 entry cross-linking ADR-123 and the uploader fix.

## UI Changes

- `SystemScoresUploadDialog.tsx`:
  - New sub-section "Bulk backfill by department (raw values)".
  - Dropdown: sub-department (FAD-*), inputs: library key + raw value pairs, dry-run preview table, typed-confirmation commit.
  - Preview table: sticky header, virtualised for >200 rows, columns "Employee Code / Full Name / Sub-dept / Current raw / Next raw / Status / Action".
  - Existing workbook uploader gains a red banner listing rows with empty manual-source cells and a "Show all" toggle (pagination at 50 rows/page).
  - Responsive: dialog switches to full-screen on `<md` viewports; typed-confirmation input auto-focuses; toast on success and on failure with copy-paste error text.

## Tests

- `admin_backfill_annual_review_manual_scores` — pgTAP-style tests via `psql` fixtures: (a) writes raw + points, (b) rescores only completed/acknowledged, (c) skips excluded, (d) skips rows whose template lacks the slot, (e) idempotent when values match.
- `SystemScoresUploadDialog.parse.test.ts` — 6 cases: raw vs points, empty cell warning, non-numeric guard, missing header, weight-0 slot, per-user-weight parity.
- `fadBackfillDryRun.test.ts` — freezes the 55± dry-run against a snapshot fixture so a template edit changing the FAD scope produces a review-visible diff.

## Open questions (please answer before I implement)

1. Include the **71 `excluded` FAD-Production** rows in the backfill? Default is **no**.
2. For FAD sub-departments whose templates **don't currently expose Annual Production / Annual PM** (Metal Handling / Pollution / RMH and the 4 FAD-Mech + 3 FAD-Production stragglers on legacy templates), do you want me to (a) skip and list, (b) add the two slots to those templates and then backfill, or (c) reassign those instances onto the standard FAD-Mech template as a separate ticket?
3. Should the 98% / 100% values be locked in for **only the current cycle**, or applied any time a FAD instance appears with those slots empty (persistent policy vs one-shot data fix)? Default is **one-shot data fix**; a persistent policy would require a new `cycle_scoped_defaults` config surface.
