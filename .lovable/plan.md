# ADR-226 Phase 2 — Legacy Recommendation Classification & Monitoring

## Why the Recommendations tab is blank

Confirmed against the database:

- `annual_review_recommendation_types` — 7 active types (master data is fine)
- `annual_review_recommendations` — **0 rows**
- `annual_review_recommendation_items` — **0 rows**

Structured capture only started with Phase 1, and no reviewer has submitted a stage since.
Meanwhile **1,375 recommendations already exist as free text** in
`annual_review_responses.qualitative_responses -> '__overall_recommendation'`:

| Stage | Prose recommendations |
|---|---|
| BU Head | 905 |
| Dept Head | 458 |
| Management | 12 |

Those are real business asks ("Recommended for promotion to SO with hike 25 Percent",
"Special increament of Rs.2000", "Kindly Promote him from unskill helper to semi skill helper")
that HR currently cannot filter, cost, or action. Phase 2 turns them into tracked records.

## What gets built

### 1. Configurable classification rules (no hardcoded keywords)

New master table `annual_review_recommendation_keywords`: pattern, matched recommendation
type, weight, active flag, notes. Admin CRUD sits beside the existing exemption-policy card
in Annual Review Admin, so HR can tune matching without a code change.

Seeded starter patterns (all editable):
- promotion: `promot`, `next level`, `elevate`, `upgrade to`, `unskill.*semi`, `to the post`
- special_hike: `special increment`, `special increament`, `hike`, `salary revis`
- one_time_reward: `bonus`, `reward`, `incentive`
- grade_change: `grade`, `band`
- training: `training`, `learning required`, `needs improvement`
- none: `proceed as applicable`, `ok`, generic praise with no ask

### 2. Amount and target extraction

Deterministic parser (shared TS + PL/pgSQL SSOT, mirroring the existing final-score-rule
pattern):
- `Rs. 5000` / `2,000` / `(2500)` gives `amount_kind = 'absolute'`
- `25 Percent` / `12%` gives `amount_kind = 'percent'`
- Trailing designation after "to" (e.g. "to SO", "to Supervisor") is matched against the
  `designations` master data for `proposed_designation_id`. No fuzzy guessing — unmatched
  text stays in the narrative only.

### 3. Backfill engine

New RPC `ar_backfill_legacy_recommendations(p_cycle_id, p_dry_run, p_limit)`:

- Reads every non-empty `__overall_recommendation` for the cycle.
- Writes `annual_review_recommendations` with `source = 'legacy_import'` and the full
  original prose preserved in `narrative` (never rewritten).
- Confidence gate: multi-signal match becomes `status = 'submitted'` (enters the HR queue);
  weak or ambiguous matches become `status = 'needs_classification'` for human confirmation.
- Prose with no actual ask maps to the `none` type, keeping the queue clean.
- **Idempotent**: unique key on (instance_id, reviewer_role, source) — a re-run refreshes
  only unclassified rows and never touches a row HR has already decided.
- **Dry-run first**: returns per-type counts plus a sample so the run can be reviewed before
  committing. Batched to respect statement limits.
- Every run is recorded in `annual_review_recommendation_import_runs` with counts and actor,
  and a rollback RPC deletes only the undecided rows created by that run.

### 4. HR monitoring surfaces

- **Recommendations tab**: add a "Needs classification" status filter and a source badge
  (Stage form / Legacy import) so imported rows are visibly distinct from captured ones,
  plus inline type correction for `needs_classification` rows.
- **Bell Curve drill-down**: recommendation badge per employee row (promotion / monetary /
  none), reusing the existing effective-rating row model.
- **Registered report `RPT-REC-001` at `/reports/recommendations`**: cycle, BU, Dept,
  manager, type and status filters; server-side pagination; cost roll-up of approved
  monetary asks by BU and Dept; CSV export honouring the standard Active/Inactive/All
  employee filter.

## Risk and impact

- **Data**: additive only — no existing table or column is changed, the prose source is read
  only. Reversible through the per-run rollback RPC.
- **Workflow**: imported rows land as `needs_classification` or `submitted`, never approved,
  so nothing auto-grants money. Existing decision RPCs are untouched.
- **UI/UX**: one new status filter and badge on an existing tab, one new report page. No
  layout changes elsewhere.
- **Regression**: `ar_recommendation_queue` gains a source column and one status option;
  existing callers keep working. Stage-form capture is unaffected.
- **Scalability**: roughly 1,400 rows for this cycle — batched inserts, server-side
  pagination, and indexes on (cycle_id, status) and (instance_id, reviewer_role).
- **Mitigation**: dry-run preview, idempotency key, per-run rollback, and unit tests on the
  classifier and amount parser (happy path, ambiguous prose, no-ask prose, currency and
  percent formats).

## Delivery order

1. Migration: keywords master table, import-runs audit table, source and status support,
   backfill plus rollback RPCs, GRANTs and RLS (HR/Admin only for import control).
2. Classifier and amount parser SSOT with unit tests.
3. Dry-run from Admin, review the counts, then commit the real run for cycle 2025-2026.
4. Recommendations tab filters, source badge, inline reclassification.
5. Bell Curve badge and the registered `/reports/recommendations` report.
6. DOCUMENTATION.md (ADR-226 Phase 2) and POLICY §AR-RECOMMENDATION-TRACKING updates.