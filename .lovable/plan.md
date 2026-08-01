# Fix: bulk downgrade never reached 101772's review form (ADR-225a)

## What was verified in the database

Employee 101772, instance `984a5423…944a0`:

- `overall_status = completed`, `total_score = 75.60`, `final_rating = Good`, `updated_at = 22 Jul 2026` — today's upload changed nothing.
- `system_scores_raw.sys_3jsce5p` (Annual Production Target Vs Actual) is still **97.007**, `system_scores.sys_3jsce5p = 20` of weight 25.
- Library bands for `annual_production` (higher-is-better): at least 95 gives 4/5, at least 85 gives 2/5. So 97 gives 20 pts and **85 gives 10 pts** — a genuine downgrade, exactly the ADR-225 path.
- `annual_review_access_audit` has **zero** rows after 30 Jul, so no upgrade and no correction was written today for anyone.

## Root cause (confirmed, not inferred)

`admin_apply_system_scores_correction` was created with `p_final_rating` typed **numeric**, while `annual_review_instances.final_rating` is **text** ('Good', 'Average', …). Inside the function it does `COALESCE(p_final_rating, v_inst.final_rating)`, which Postgres rejects at execution with `COALESCE types numeric and text cannot be matched` (reproduced directly).

Every downgrade commit therefore throws before the UPDATE, is swallowed by `commitDryRun`'s try/catch, counted as `failed`, and the review form keeps the old 97 / 20 value. The sibling `admin_apply_system_scores_upgrade` declares the same argument as `text` — the correction copy drifted.

Second defect found in the same read: both RPCs are called with `p_total_score: null` and `p_final_rating: null`, and neither recomputes. So even after a cell write succeeds, `total_score` and `final_rating` stay at the pre-correction value (75.60 / Good). A downgrade that edits the cell but leaves the headline score untouched is still wrong.

## 5-Why

1. Score not updated in the form — the commit RPC raised an exception.
2. Why — `COALESCE(numeric, text)` type mismatch inside the function.
3. Why — `p_final_rating` was declared `numeric` instead of `text`.
4. Why — the correction RPC was written from scratch instead of derived from the proven upgrade RPC, and no test executed it against a row with a non-null `final_rating`.
5. Why — no automated smoke test calls the annual-review admin RPCs against real column types; only client-side unit tests exist.

## Fix

### 1. Migration — recreate `admin_apply_system_scores_correction`
- `p_final_rating` becomes **text** (matching the column and the upgrade RPC); the local `v_next_final` becomes text.
- After the cell merge and UPDATE, when the caller passes no explicit total, recompute from stored state via `annual_review_compute_final_summary(p_instance_id)` and write back `total_score` and `final_rating`. Explicit caller values still win.
- The audit row keeps the full before/after maps and additionally records the recomputed total and rating, so a run stays reversible.
- `overall_status` is still never touched; admin / hr_pms role check and the 10-character reason are still enforced.

### 2. Client
- `commitDryRun` keeps routing downgrade rows to the correction RPC; the explicit null `p_final_rating` stays valid once the parameter is text.
- Surface commit failures loudly: the dialog reports `updated` but buries `errors`. Show a destructive toast plus the per-employee error list whenever `failed > 0`, so a server-side exception can never look like a silent no-op again.

### 3. Repair 101772 and the rest of today's file
- After the migration, re-run the same upload with **Apply to Completed reviews** plus **Allow downgrades (corrections)** and the correction reason. This writes 85 to 10 pts and recomputes the final score, with one audit row per employee.
- Verify for 101772: raw = 85, points = 10, `total_score` recomputed (about 65.60), one `system_scores.admin_correction` audit row.

## Risk and impact
- **Data**: completed reviews change downward — the intended ADR-225 behaviour, now with correct totals. Ratings and increment slabs for affected employees will move; the dry-run downgrade badge shows the count before commit.
- **Workflow**: none — status untouched.
- **Regression**: `admin_apply_system_scores_upgrade` is not modified; the correction RPC currently fails 100% of the time, so no working behaviour can regress.
- **Rollback**: the audit `before` payload holds the complete prior score maps, total and rating; the migration is a single CREATE OR REPLACE.

## Tests and docs
- `src/test/annualReview/cycleBulkDowngrade.test.ts`: add cases asserting the correction RPC is called with a text-compatible `p_final_rating`, and that a failed commit is reported as `failed` with a non-empty `errors` array.
- Docs: `docs/adr/ADR-225a.md` (RPC signature parity plus recompute), POLICY §AR-SYSTEM-SCORE-ADMIN-CORRECTION amended with "a correction must recompute total and rating", DOCUMENTATION.md version history.