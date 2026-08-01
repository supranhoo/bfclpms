# Allow score downgrades in Annual Review bulk data upload (ADR-225)

## Problem
The bulk upload dry-run skipped all 261 completed rows with "new score is lower than stored; downgrades are blocked on completed reviews". The corrected production/maintenance figures are genuinely lower, so the upgrade-only rule is wrong for this correction cycle.

Two independent guards enforce it:
1. Client dry-run (`src/services/annualReview/cycleBulkDataUpload.ts`, cell-level block).
2. Database RPC `admin_apply_system_scores_upgrade` (per-cell monotonic merge, plus monotonic-only total/final).

Both must change together, otherwise the UI shows "apply" and the write silently no-ops.

## What will be built

### 1. New admin opt-in: "Allow downgrades (corrections)"
A third checkbox in the bulk upload dialog, enabled only when "Apply to Completed reviews" or "Apply to mid-workflow reviews" is on. Turning it on:
- clears any existing dry-run (same behaviour as the other flags),
- requires a mandatory correction reason (min 10 chars) before Commit is enabled,
- shows a destructive-style warning that stored scores may fall and downstream rating/slab may change.

### 2. Dry-run treats downgrades as visible changes
Instead of skipping, a lower score becomes a normal change row flagged `direction: 'down'`, rendered with a red down-arrow and `20.00 -> 10.00`. The header gains an `N downgrades` badge next to apply/skip/error so impact is quantified before commit. With the flag off, behaviour is unchanged (still skipped with the same reason).

### 3. New database RPC `admin_apply_system_scores_correction`
Additive; the existing upgrade RPC is left untouched for every other caller.
- Admin-only (`admin`, `hr_pms`), `SECURITY DEFINER`, `FOR UPDATE` lock, same shape as the upgrade RPC.
- Per-cell merge accepts lower values; `p_reason` is required and enforced non-empty.
- `total_score` / `final_rating` are written from caller values in either direction (no monotonic clamp).
- Writes `annual_review_access_audit` with action `system_scores.admin_correction` (added to the action check constraint) containing full before/after score maps, the overall status and the reason.
- Returns `{applied, blocked, direction_summary}` so the client can report the real outcome.

### 4. Commit path
`commitDryRun` routes a row to `admin_apply_system_scores_correction` when the downgrade flag is on and the row has at least one downward cell; otherwise it keeps using the existing upgrade RPC. The result toast reports upgraded and downgraded counts separately.

## Risk and impact
- **Data impact**: completed reviews become mutable downward for admins. Mitigated by explicit opt-in, mandatory reason, full before/after audit rows, and no change to the default path.
- **Workflow impact**: none — `overall_status` is never touched; a completed review stays completed.
- **Downstream**: Bell Curve, rating slabs and calibration read stored scores, so distributions shift after a downgrade run. The dry-run downgrade badge makes this visible before commit.
- **Regression risk**: low — the upgrade RPC and default upload behaviour are unchanged; new logic sits behind a flag.
- **Rollback**: the audit row holds the complete prior `system_scores`, `system_scores_raw`, `total_score` and `final_rating`, so a run can be reversed from audit data. The new RPC can be dropped without affecting existing flows.

## Technical notes
- `src/lib/annualReview/bulkStageCoverage.ts` gains `allowDowngrades` in `StageCoverageOptions`; coverage mode stays `admin_upgrade` (routing decided per row at commit).
- Files touched: `cycleBulkDataUpload.ts`, `bulkStageCoverage.ts`, `CycleBulkDataUploadDialog.tsx`, the dry-run table cell renderer, one migration.
- Tests: extend `src/test/annualReview/bulkStageCoverage.test.ts` and add `cycleBulkDowngrade.test.ts` covering flag off = skip, flag on = change row, mixed up/down row routing, reason required.
- Docs: `docs/adr/ADR-225.md`, POLICY §AR-SYSTEM-SCORE-ADMIN-CORRECTION, DOCUMENTATION.md version history.