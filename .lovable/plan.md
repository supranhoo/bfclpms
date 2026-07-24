## What Sindhu is seeing — confirmed root cause

Sindhu Raj Singh (101089) is the **BU Head** on 35 instances that are currently stuck at `pending_bu` in the active cycle. Every one of them was `completed` before **2026‑07‑24 11:06**, when the ADR‑155 repair migration ("BU/Dept collapse false‑complete — Rakesh Gupta grievance") rewound them.

Verified from the database:

- 35 pending_bu instances under Sindhu — all have a locked `self` response, none have any `bu_head` response row (draft or locked).
- 35 matching rows in `annual_review_reset_archive` with reason `ADR‑155: BU/Dept collapse false-complete` and `prior_status = completed`.
- Each archived row contains the wiped `dept_head` response — locked, with criteria scores, `reviewer_id = Sindhu`.
- The same pattern exists system‑wide: 53 archived responses across 4 BU Heads, and in every one the archived reviewer_id is the same person as the bu_head_id (single‑person collapsed Dept/BU).

| BU Head | Reset | Same‑person reviewed |
|---|---|---|
| Sindhu Raj Singh (101089) | 35 | 35 |
| Rakesh Kumar Gupta (101902) | 12 | 12 |
| Chandan Kumar Pandit (101885) | 5 | 5 |
| Brundaban Chandra Das (102028) | 1 | 1 |

## 5 Whys

1. Why does Sindhu see "pending" for reviews she completed? → Status is `pending_bu` and no `bu_head` response exists.
2. Why is there no `bu_head` response? → Her single locked response was recorded as `dept_head` (collapsed Dept/BU), and ADR‑155 archived it.
3. Why did ADR‑155 archive it? → The repair was built for Rakesh Gupta's grievance: when the same person is Dept + BU Head, the Dept submission was being treated as terminal, blocking a distinct BU recommendation. It archives the Dept response and rewinds to `pending_bu` so the person can add a BU‑level recommendation.
4. Why did that penalise Sindhu when it helped Rakesh? → The migration treated **all** collapsed Dept/BU completed instances the same way. Sindhu's user intent was "I already reviewed once and consider the review done", not "I still owe a BU recommendation".
5. Why did nothing catch that before deploy? → No per‑BU‑Head triage, no in‑app notice sent to affected reviewers, and no restore path for cases where a second recommendation isn't wanted.

## RCA (one line)

ADR‑155's collapse repair unconditionally archived the collapsed reviewer's single locked response and rewound to `pending_bu`, wiping Sindhu's (and two other BU Heads') already‑completed work.

## CAPA — plan

### Corrective (restore Sindhu's 35 immediately, and the other single‑submit BU Heads on approval)

Add a repair migration **ADR‑159 — Restore collapsed BU/Dept completions wiped by ADR‑155** that, per instance:

1. Reads the archived `dept_head` response from `annual_review_reset_archive` where reason starts with `ADR‑155`.
2. Only proceeds when `reviewer_id = current bu_head_id`, `is_locked = true`, and status is still `pending_bu` with no existing `bu_head` response — so we can never overwrite live work.
3. Upserts an `annual_review_responses` row with `reviewer_role='bu_head'`, copying `criteria_scores`, `comments`, `weighted_score`, `submitted_at`, `is_locked=true`, `reviewer_id = bu_head_id`.
4. Calls the existing terminal‑completion path (`hydrate_annual_review_system_scores` + `annual_review_next_status`) to recompute totals and move status to `completed`.
5. Writes an `annual_review_access_audit` row with action `management_stage.backfilled` (already an allowed action code) and reason `ADR‑159 restore: bu_head promotion from ADR‑155 archive`.
6. Skips any archived row that fails the guards and returns them in the migration's dry‑run report.

Scope: Sindhu's 35 by default. Rakesh's 12 stay untouched (his grievance is what created ADR‑155 in the first place). Chandan's 5 and Brundaban's 1 are optional — I'll only restore them if you say so.

### Preventive

- Update the `trg_enforce_collapsed_dept_bu_normalise` trigger so that when a collapse is detected AND a locked response by the collapsed reviewer already exists AND the instance is `completed`, it **promotes** that response to `bu_head` in place instead of archiving + rewinding. This preserves ADR‑155's intent for future Rakesh‑style cases (send‑back can still be initiated explicitly by the reviewer) without wiping already‑finalised work.
- Add a pre‑flight report to any future bulk repair migration that lists distinct affected reviewer names + counts and requires explicit confirmation before running.

### Documentation / policy sync

- Append **ADR‑159** and update **POLICY §AR‑COLLAPSED‑DEPT‑BU‑NORMALISATION** to state the promote‑in‑place rule and the archive‑only condition (must have an unlocked dept_head draft or no locked response).
- Update `DOCUMENTATION.md` version history.

## Question before I run the fix

Which BU Heads should ADR‑159 restore automatically?

- **A.** Only Sindhu (35 instances).
- **B.** Sindhu + Chandan Kumar Pandit + Brundaban Chandra Das (41 instances). Leave Rakesh's 12 pending — that was the original grievance.
- **C.** All four including Rakesh's 12 (undoes ADR‑155 entirely for Rakesh).

Default recommendation: **B**. Say which and I'll produce the migration + audit + preventive‑trigger update in build mode.

## Not Applicable

UI changes, tests: the fix is a data + trigger repair; existing scorecard UI will reflect the restored `completed` status automatically. No new UI surface.
