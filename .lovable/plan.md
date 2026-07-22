
# RCA & Fix Plan — Dilip Kumar Ojha (100020) stuck at Self Review after HOD send-back

Instance: `d15c3bea-acdd-4837-9adf-8c902b575425`
Cycle: `b82a935f-…` · Template: `Generic M - (With KRA)` v-active · Reviewers: Self → Sajid Raza (Dept Head, 100264) → Parshu Ram Shukla (BU Head, 100894)

## 1. Confirmed current state (from DB reads)

- `annual_review_instances.overall_status = 'pending_self'`
- `enabled_stages = ['self','dept_head','bu_head']` — dept_head correctly present (Dilip is not a BU Head, so ADR-109 stripping does not apply).
- Exactly one row in `annual_review_responses` for this instance:
  - `reviewer_role = 'self'`
  - `qualitative_responses` — **fully populated** (11 long-form answers)
  - `criteria_scores = {}` — **empty**
  - `submitted_at = NULL`, `is_locked = false`, `weighted_score = 0.00`
  - `updated_at = 2026-07-22 10:15:04` (touched after the send-back timestamp on the instance, `10:33`)
- No `annual_review_proxy_submissions` rows — this was never a proxy flow.

## 2. Root Cause (5-Why)

1. **Why can Dilip not resubmit?** The submit RPC's guard (POLICY §AR-SELF-SUBMIT-CRITERIA-GUARD, ADR-115) rejects the submission because `criteria_scores` on the self response is `{}` — no scored criterion keys.
2. **Why is `criteria_scores` empty when Dilip's qualitative answers survived?** The send-back path resets the criterion score map (and clears `submitted_at` / `weighted_score`) but preserves `qualitative_responses`. That preservation is intentional; the score wipe is a legacy behaviour of the regression trigger, not a policy decision.
3. **Why did Sajid (HOD) see the questions but not the answers?** He opened the review while `criteria_scores` was already `{}`. Either (a) the self stage had advanced with an empty score map (a pre-ADR-115 window / proxy path), or (b) the score-wipe on send-back happened before the qualitative preservation branch and the UI he saw was already post-regression. Qualitative answers render only on the self surface, so the HOD scorecard legitimately looked empty to him — this is a **data-visibility gap** in the HOD read model, not lost data.
4. **Why did the PMS advance a self stage with `criteria_scores = {}` in the first place?** The `advance_annual_review_status` code path that handled this instance did not re-check criteria completeness for templates whose criteria live in `annual_review_criteria_assignments` (the library-driven path) — only for the inline `sections.criteria[]` path. Generic M - (With KRA) has `sections.criteria = []` because its criteria are library-assigned, so the guard was silently skipped.
5. **Why does the UI now feel "read-only"?** With `is_locked=false` and `submitted_at=NULL`, the form is editable, but the criterion score radios re-hydrate against an empty map. Combined with the ADR-119 radio-value coercion (string vs number), a stale `submitted_at` was cleared but the client cache may still hold the pre-send-back read-only state until a hard refresh.

**Primary root cause:** advance-guard bypass on library-driven templates lets the self stage progress with an empty `criteria_scores`; the send-back's score-wipe then leaves a legitimately-editable row that the submit guard correctly refuses.

## 3. Category breakdown requested

| Aspect | Verdict |
|---|---|
| Workflow gap | Advance path skipped criteria-completeness check for library-driven templates |
| Status mismatch | None — `overall_status='pending_self'` is truthful; the "still shows Self Review Pending" is correct |
| Permission issue | None — Dilip owns the row, RLS allows edit |
| Data visibility | HOD scorecard hides qualitative answers by design; when `criteria_scores={}` HOD sees a blank grid |
| Configuration | Template `sections.criteria=[]`; criteria supplied via `annual_review_criteria_assignments` — valid but under-guarded |
| Validation | Submit guard (ADR-115) is doing its job; advance guard is the weak link |

## 4. Immediate corrective actions (data)

1. **Unblock Dilip now**: leave `overall_status='pending_self'`, keep the qualitative answers, and let him rescore the criteria. Add a one-time toast on his surface: *"Please re-score each criterion — your written answers are preserved."*
2. Hard-refresh guidance / bust the client React Query cache for this instance so the "read-only" perception clears.
3. Audit-log the send-back score-wipe retrospectively into `annual_review_reset_archive` for traceability (`reason='hod_send_back_score_wipe_backfill'`).

## 5. Permanent CAPA

- **ADR-134 — Advance guard parity for library-driven templates.** Extend `advance_annual_review_status` and the `criteria-complete` predicate to resolve the effective criterion set from `annual_review_criteria_assignments` (matched by archetype/grade/department/sub-unit) when `sections.criteria` is empty. Reject self-stage advancement if any resolved criterion key is missing from `criteria_scores`.
- **POLICY §AR-SEND-BACK-PRESERVATION.** Formalise that send-back preserves `qualitative_responses` and clears `criteria_scores`, `submitted_at`, `weighted_score` only — and require a user-facing notice on the self surface explaining what to redo.
- **HOD read model fix.** When `criteria_scores={}` on a stage the HOD is reviewing, surface the self stage's qualitative answers in a read-only "Employee context" panel so the HOD is not left staring at an empty grid.
- **Regression tests** (per BFCL PMS simplification skill):
  - Unit: `advanceGuard.libraryDrivenTemplate.rejectsEmptyScores.test.ts`
  - Unit: `sendBackPreservation.qualitativeSurvives.test.ts`
  - Integration: HOD scorecard shows qualitative panel when scores empty.
  - Mock factory: `generateMockAnnualReviewInstance({ templateMode: 'library', stage: 'self', criteriaScores: {} })`.
- **DOCUMENTATION.md** + **POLICY.md**: add v2.66.134 entry (RCA + CAPA), version-history line, and cross-reference ADR-115 / ADR-119.

## 6. Risk & Impact

- **Data**: no destructive change; one archival insert, one instance touched, backfill scoped by `instance_id`.
- **Workflow**: advance guard becomes stricter — will surface any other instances currently sitting in a wrongly-advanced stage. Ship a dry-run report first.
- **UI**: adds one toast, one read-only qualitative panel on HOD surface.
- **Regression**: low; guard is additive on the library-driven branch that was previously unchecked.
- **Rollback**: revert the advance-guard patch and remove the HOD panel; data backfill is append-only.

## 7. Verification

- Dilip: reload → six score options selectable → submit succeeds → status flips to `pending_dept_head`.
- Sajid: opens instance → sees Dilip's qualitative answers panel + scored criteria grid.
- SQL sweep: `SELECT count(*) FROM annual_review_instances i JOIN annual_review_responses r ON r.instance_id=i.id WHERE r.reviewer_role='self' AND r.criteria_scores='{}'::jsonb AND i.overall_status <> 'pending_self'` — expected 0 after guard rollout.
