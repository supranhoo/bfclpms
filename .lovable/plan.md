# Tracking Dept/BU Head recommendations (promotion, special hike, monetary)

## Where we are today

Recommendations already exist, but only as prose. `OverallRecommendationCard` writes one free-text blob into `annual_review_responses.qualitative_responses['__overall_recommendation']`; Dept Head, BU Head and Management may write one, and it is mandatory for BU Head and Management. It is shown on the review detail page, in the employee results view, and as three text columns in the operational Excel export. Nothing else consumes it.

Live data confirms the gap:

- 1,376 recommendations written so far (905 BU Head, 459 Dept Head, 12 Management).
- ~211 mention promotion, ~245 mention money ("additional increment of Rs 3000", "increment of 15% of gross", "promote from Helper to Lab Asst").

So HR is already receiving promotion and hike proposals, but they are buried in prose: not filterable, not countable, not costable, no approve/reject decision, no link to the increment run, and no audit of who acted on them.

## The idea

Keep the narrative, add **structure next to it**. A recommendation becomes a first-class record with a type, an optional monetary ask, an optional target designation/grade, and a decision lifecycle owned by HR/Management.

```text
Dept/BU Head writes recommendation
  → type (master data) + optional amount/% + optional target grade + narrative
  → record created, status = submitted
        ↓
HR / Management queue  → approve | reject | defer | modify (with reason)
        ↓
Approved → visible on employee result, counted in cost roll-up,
           available as an input to the increment run
```

## What the user sees, screen by screen

**1. Review detail — Overall recommendation card (Dept/BU/Management)**
The existing textarea stays. Above it: a **Recommendation type** multi-select fed from master data (Promotion, Special hike, One-time bonus/reward, Grade/band change, Role change, Training/development, No monetary recommendation). Choosing a monetary type reveals **Amount** with an Absolute / % of gross toggle; choosing Promotion or Grade change reveals **Proposed designation** and **Proposed grade** pickers plus **Suggested effective from**. Narrative remains mandatory for the roles it is mandatory for today. Later stages see earlier recommendations as read-only structured chips + text.

**2. Employee results / acknowledgment**
Employee sees the recommendation type and narrative. Amounts and the HR decision are hidden until the decision reaches an admin-configured visibility state (default: only after approval, and amount hidden entirely by default).

**3. New Annual Review Admin tab — "Recommendations"** (HR PMS / Admin / Management)
Server-paginated queue of all recommendations for the cycle: employee, department/BU, recommender + stage, type, ask (amount or %), current designation → proposed, final rating /5, effective slab %, status, aging. Filters: cycle, type, status, department/BU, recommender, monetary yes/no, rating band. Row actions: Approve / Reject / Defer / Approve-with-modification (amount override), each requiring a reason and writing an audit row. Bulk approve/reject on selection. Header KPI strip: count by type, total monetary ask, approved cost, pending count.

**4. Bell Curve drill-down**
A **Rec** column (badges: P = promotion, ₹ = monetary) and a "Has recommendation" filter, so calibration happens with the recommendation visible.

**5. New report — RPT-AR-REC-001, "Annual Review Recommendations"** at `/reports/annual-review-recommendations`
Registered in the report catalog with renamable fields, the standard Active/Inactive/All employee filter (POLICY §RPT-EMPLOYEE-STATUS-FILTER), hierarchy scoping, and Excel/CSV export. Two sheets: one row per recommendation, plus a summary pivot (by department / BU / type / status with cost totals).

**6. Increment linkage (phase 3)**
Approved monetary recommendations surface inside the increment run as a flagged adjustment input the HR runner can accept or ignore. No automatic salary change — recommendation approval never mutates pay by itself.

## Legacy 1,376 free-text recommendations

A one-off classifier scans existing text for promotion/monetary intent and creates records with status `needs_classification` and a parsed suggestion (type + amount when the text contains one). HR confirms or edits from the queue. Nothing is auto-approved and the original text is never rewritten — it stays the source of truth for the narrative.

## Technical design

- **Master data (zero hardcoding).** `annual_review_recommendation_types` (key, label, is_monetary, requires_amount, requires_target_role, is_active, sort_order) with admin CRUD in Annual Review Settings. Config in `annual_review_settings`: which reviewer roles may recommend, whether amount is mandatory, max amount / max %, employee visibility of type / amount / decision.
- **New table** `public.annual_review_recommendations`: instance_id, cycle_id, employee_id, reviewer_id, reviewer_role, type_id, amount_kind (`absolute` | `percent`), amount_value, proposed_designation_id, proposed_grade_id, effective_from, narrative_snapshot, status (`draft`|`submitted`|`needs_classification`|`approved`|`approved_modified`|`rejected`|`deferred`|`implemented`), decided_by/at/reason, approved_amount_value, created_at/updated_at + update trigger. Unique on (instance_id, reviewer_role) — one recommendation record per stage, multiple types held in a child `annual_review_recommendation_items` row set. GRANTs to `authenticated` / `service_role`, RLS enabled, no `anon`.
- **RLS.** Recommender can read/write their own row while their stage is unlocked; downstream reviewers and the employee read via the existing `annual_review_accessible_instances` helper (SECURITY DEFINER, no recursion); only HR PMS / Admin / Management may set decision fields. Employee visibility of amount enforced server-side in the read RPC, not only in the UI.
- **Writes via RPC.** `ar_save_recommendation` (stage-lock aware, validates against config caps) and `ar_decide_recommendation` / `ar_bulk_decide_recommendations` (role-gated, reason required, writes `annual_review_access_audit`). The existing submit path keeps writing the narrative to `qualitative_responses` so no current surface breaks.
- **Service layer.** `src/services/annualReview/recommendations.ts` for queries/mutations; `src/lib/annualReview/recommendation.ts` for pure helpers (cost roll-up, legacy text classifier, badge derivation) so the logic is unit-testable and shared by UI + export.
- **Pagination.** Queue and report are server-paginated (50/page) with server-side filters; no unbounded fetch. Export uses the existing batched-fetch pattern with a progress indicator.

## Risk and impact

- **Data:** additive only — new tables, no change to `annual_review_responses`, no schema change on instances. Existing recommendations keep working untouched.
- **Workflow:** the recommendation card gains required fields for the roles where narrative is already required; nothing new blocks Self/Manager. Approval is a new HR step that does not gate review completion.
- **Regression:** low-moderate — the card is on the hot submit path, so the structured fields must fail open (missing type never blocks a stage that could previously submit, except where config makes it mandatory).
- **Scalability:** ~1.4k rows/cycle; indexed on (cycle_id, status), (employee_id), (reviewer_id).
- **Rollback:** feature-flagged (`admin_feature_flags`); off = today's plain textarea. Tables are additive and can be dropped.

## Suggested phasing

1. **Phase 1 — capture:** master data, tables/RLS/RPC, structured card, read-only display downstream, legacy classifier run.
2. **Phase 2 — govern & report:** Admin Recommendations queue with decisions and audit, Bell Curve badge/filter, RPT-AR-REC-001 with exports.
3. **Phase 3 — money:** cost roll-up dashboard and the increment-run linkage.

## Open decisions before build

1. Should HR approval be **mandatory** before a recommendation is visible to the employee, or is the recommendation shown as "recommended, pending decision"?
2. Should monetary amounts be captured as **absolute ₹**, **% of gross**, or both (plan assumes both)?
3. Who owns the final decision — **HR PMS**, **Management**, or a two-step HR → Management approval?
4. Should an approved special hike **feed the increment run automatically as a proposed adjustment**, or stay advisory only?

## Docs and guards

ADR-226 (recommendation tracking design + invariants), POLICY §AR-RECOMMENDATION-TRACKING (capture rules, decision authority, employee visibility, "approval never mutates pay"), memory entry, and unit tests for the classifier, cost roll-up, config validation and RLS decision gating.
