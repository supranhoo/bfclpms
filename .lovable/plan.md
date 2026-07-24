
## Grievance verification — FACTUAL (partially)

Rakesh Kumar Gupta is both `dept_head` AND `bu_head` (collapsed hierarchy) for these employees. The `dept_head` response is locked (submitted by Rakesh himself, mostly with weighted_score = 0), but NO `bu_head` response exists — yet `overall_status = 'completed'`.

### Confirmed impacted (9 instances, need rollback)
| Code | Name | Status | Dept score | BU response |
|---|---|---|---|---|
| 100309 | Suraj Dev Prasad | completed | 0.00 | missing |
| 100165 | Sandeep Kumar Singh | completed | 0.00 | missing |
| 101712 | Pratistha Pathak | completed | 0.00 | missing |
| 100555 | Hemchand Kumar | completed | 325 (auto) | missing |
| 100345 | Damar Lal Mahto | completed | (locked) | missing |
| 101733 | Mohit Kumar | completed | 0.00 | missing |
| 100485 | Shubham Kumar | completed | 0.00 | missing |
| 100755 | Ashu Kumar Sharma | completed | (locked) | missing |
| 100179 | Vikram Gope | completed | 325 (auto) | missing |

### Not Rakesh's cases (out of scope; keep as-is)
- Nitesh Agarwal, Badal Kumar Sao, Aditi Kumari — no instance in active cycle (not mapped).
- Mohit Kumar (101690), Shubham Kumar (100807/100185/100448/100712/200577/101604/101702) — different employees with same name, other BU heads.

---

## 5-Why RCA

1. Why are these completed without a BU-Head review? → Terminal completion fired after dept_head lock.
2. Why? → When `dept_head_id = bu_head_id` (reviewer collapse, ADR-137R), the workflow strips the redundant BU stage and treats the dept_head lock as terminal.
3. Why did Rakesh not know he was finalising? → The employee's stepper/CTA still labels the stage "Dept Head" (not "BU Head Final"), and no mandatory overall-recommendation guard (ADR-151) applied at the dept_head slot even though it was the terminal stage.
4. Why were scores zero on lock? → The RPC advanced the instance without ADR-115 criteria-scores validation on the collapsed terminal path.
5. Why did the terminal-integrity guard (ADR-153 `trg_annual_review_terminal_has_human_reviewer`) not block? → The rule accepts any non-self locked response; a `dept_head` lock satisfied it even when `enabled_stages` still listed `bu_head` (chain/enabled-stages mismatch).

**Root cause:** Chain-collapse normalisation is inconsistent — `enabled_stages` was NOT trimmed to drop `bu_head` when dept=BU, but the completion path treated dept_head as terminal anyway. The UI, mandatory-recommendation guard, and score-validation guard all key off the labelled role (`dept_head`) and therefore skip the BU-Head enforcement Rakesh expected.

---

## CAPA

### Corrective (data repair — 9 instances)
For each of the 9 instance IDs:
1. Rewind `overall_status` → `pending_bu`.
2. Unlock/delete the stray `dept_head` response (keep audit copy in `annual_review_reset_archive`).
3. Reset `total_score`, `criteria_weighted_score`, `final_score`, `completed_at`, `finalised_by` to NULL.
4. Preserve locked `self` response untouched.
5. Ensure `bu_head_id = Rakesh` is set and `enabled_stages` = `[self, bu_head]` (drop redundant `dept_head`).
6. Write `annual_review_access_audit` row: `action = 'bu_terminal_restore'`, `reason = 'Grievance Rakesh Gupta — dept/BU collapse false-complete'`.

### Preventive (code + policy)
- **Trigger `enforce_bu_head_terminal_stage` extension:** on any instance where `dept_head_id = bu_head_id` and both are set, auto-strip `dept_head` from `enabled_stages` and delete any empty stray `dept_head` responses. Idempotent, runs BEFORE INSERT/UPDATE.
- **Guard `trg_annual_review_guard_completion`:** reject completion when a locked response's `reviewer_role` is not the terminal role of the chain (per `resolveEffectiveChain`). This closes the ADR-137R gap.
- **UI (`TeamReviewDetailContent.tsx` + stepper labels):** when collapse is detected, render the single reviewer stage as "BU Head Final Review" (never "Dept Head"), and apply ADR-151 mandatory-recommendation + ADR-115 criteria-score guards at that stage.
- **Backfill sweep (one-off RPC `repair_collapsed_bu_terminal_completions`):** scan the active cycle for any other instance matching the same pattern (dept=BU, only dept_head locked, no bu_head response) and list them for admin review before repair (no auto-rewind on unreported cases without explicit trigger).
- **POLICY.md §AR-BU-HEAD-TERMINAL (ADR-137R → §AR-BU-COLLAPSE-NORMALISE):** codify that `enabled_stages` MUST be normalised at reviewer-collapse time; terminal completion MUST match the trimmed chain's terminal role.
- **DOCUMENTATION.md:** update ADR-137R with the collapse-normalisation invariant, and add ADR-155 for this fix.

### Verification
- Contract test: creating an instance with dept=BU produces `enabled_stages = [self, bu_head]`.
- Regression test: attempting to complete with only a `dept_head` locked response raises the guard.
- Manual QA: log in as Rakesh → confirm 9 employees appear in his "BU Head Review Pending" queue, allow scoring, mandatory recommendation, and clean finalisation.
- Query: `SELECT count(*)=0 FROM instances WHERE overall_status='completed' AND dept_head_id=bu_head_id AND NOT EXISTS(SELECT 1 FROM responses WHERE reviewer_role='bu_head' AND is_locked)`.

---

## Risk & Impact
- **Data:** 9 rows rewound; self responses preserved; audit archived. Reversible via `annual_review_reset_archive`.
- **Workflow:** Rakesh regains 9 pending items; no impact on other BU heads.
- **UI:** Stepper label change limited to collapse case; no layout impact elsewhere.
- **Regression:** New completion guard could reject legacy in-flight instances; the migration first normalises all collapsed instances before enabling the strict guard.
- **Scalability:** All changes are per-instance triggers; O(1) per write.

## Not Applicable
- No new tables, no RLS changes beyond audit inserts, no pagination changes.
