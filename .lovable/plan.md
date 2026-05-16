## Why "116" looks wrong

The **HR PMS Reviewed** tile on `Dashboard?view=hr_pms` only counts KPIs whose `review_submissions.hr_pms_score IS NOT NULL` (plus N/A approvals past the HR PMS stage). It ignores KPIs whose `kpis.status` has already advanced past `hr_pms_review` but whose submission row is missing an `hr_pms_score` signature.

### DB evidence (April 2026, no roster filter)

| Bucket | Count |
|---|---|
| `status = hr_pms_review` (in stage) | 448 |
| `status` past HR PMS (`audit`/`management_review`/`approved`) | 239 |
| `hr_pms_score IS NOT NULL` | 125 |
| N/A approvals | 82 |
| **Past HR PMS but no score and not N/A** | **109** (audit 28 / management_review 41 / approved 40) |

Once the dashboard's roster + workflow filter is applied this collapses to ~1090 KPIs and the same shortfall surfaces as **HR PMS Reviewed = 116** even though several hundred KPIs have demonstrably moved past that stage. The discrepancy is real and reproducible.

### Code root cause

`src/components/review/EmployeeSelectorGrid.tsx` (HR PMS branch, ~lines 1059–1095):
- `forwarded` (KPIs whose status is past `hr_pms_review`) is computed but **never folded into `reviewed`**.
- `reviewed` is derived purely from `hr_pms_score` / N/A signatures via `submissionScoreMap`.
- Result: any KPI that advanced via auto-advance, bulk approval, legacy import, or any path that did not stamp `hr_pms_score` is invisible to the tile, even though by workflow it has clearly cleared HR PMS.

This contradicts the tile's stated semantics ("KPIs that have completed HR PMS for this period") and the per-row "Reviewed" math used elsewhere in the same dashboard (the row badges and the `getProgressSegments` "done" segment for `hr_pms` already use `scoreReviewed ?? badge3`, but `badge3` itself is `forwarded`-aware in row aggregation, while the **tile** is not).

## Plan

### 1. Fix the tile aggregation (single file)

`src/components/review/EmployeeSelectorGrid.tsx` — HR PMS branch (~L1059-1095):

- Track a per-KPI `countedAsReviewed` flag while iterating `relevantKpis`.
- Mark reviewed when ANY of the following is true:
  1. `submissionScoreMap.get(k.id)?.hr_pms_score != null` (existing rule)
  2. `is_na === true` AND status is past `hr_pms_review` OR `status === 'approved'` on a workflow without HR PMS (existing rule)
  3. **NEW**: workflow contains `hr_pms_review` AND `k.status` appears in `stages.slice(hrIdx + 1)` (i.e. the existing `forwarded` condition). This restores the structural truth that any KPI past HR PMS has, by definition, completed HR PMS.
- Keep `pending` and `inReview` exactly as they are (no double counting because reviewed/forwarded statuses do not overlap with `hr_pms_review` or pre-HR-PMS reviewable statuses).
- Return `stat3 = reviewed` as today.

No behavioural change to `pending_self_review`, `pending_manager_review`, `pending_skip_review`, `audit`, `management`, `team`, `skip_level`, or `self` branches.

### 2. Tooltip + subtitle copy

Update the tile's `tooltip` on line ~1395 to read: *"KPIs that have completed the HR PMS stage for this period — either an HR PMS score is recorded or the KPI has advanced past the HR PMS stage."* Subtitle ("of total KPIs") stays.

### 3. Regression test (new)

`src/test/hrPmsReviewedTile.test.ts` — unit-tests the same classification helper inline (mirrors `teamReviewsFullAccessTiles.test.ts` pattern) covering:
- KPI in `hr_pms_review` → `inReview` only.
- KPI in `audit` with no submission row → `reviewed` (regression for current bug).
- KPI in `approved` with submission row missing `hr_pms_score` and `is_na=false` → `reviewed`.
- KPI in `self_review` → `pending`.
- KPI with `hr_pms_score` set but status still `hr_pms_review` → counted as `reviewed` (signature wins, and not double counted as inReview because reviewed and inReview branches are mutually exclusive on status).
- Sum invariant: `pending + inReview + reviewed ≤ totalKpis` (remaining are pre-self-review `kra_set`).

### 4. Documentation & policy sync

- `POLICY.md` §115 — extend BUG-046 rule: "HR PMS Reviewed counts a KPI when an `hr_pms_score` signature exists, an N/A approval clears the HR PMS stage, **or the KPI's current status is structurally past `hr_pms_review` in its resolved workflow**."
- `DOCUMENTATION.md` v2.66.11.15 — RCA entry for the April 2026 HR PMS Reviewed undercount, with the 116 → expected count diff.
- `mem/features/review/hr-pms-reviewed-tile-semantics` — new memory: tile classification rule + reference to `EmployeeSelectorGrid.tsx` HR PMS branch + test file.
- Update `mem/index.md` to reference the new memory.

### 5. Out of scope

- Backfilling missing `hr_pms_score` rows for the 109 past-stage KPIs without a recorded score (data-integrity question, separate ticket once we confirm whether they should be auto-advance N/A or carry a real score).
- Changes to per-row badges, progress bars, or "Show only Reviewed" filter — these already use the broader signature and are consistent.
- Other reviewer-stage tiles (Audit Reviewed, Management Reviewed) — Audit branch (~L1010-1044) has the same shape and may also undercount; flagged as a separate follow-up after we confirm this fix.

## Risk & Impact

- **Data**: read-only UI math change; no schema, no RLS, no migrations.
- **Workflow**: none — only the tile number changes.
- **UI/UX**: HR PMS Reviewed value increases (e.g. Apr 2026 ~116 → ~225+) and matches the per-employee "done" segments. Pending and In HR PMS are untouched.
- **Regression**: low. Branch is HR-PMS-only; behaviour for other roles untouched. New unit test locks the rule.
- **Mitigation**: regression test + tooltip copy update + documented policy.
