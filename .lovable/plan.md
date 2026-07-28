## 1. Audit findings (read-only, verified against live data)

**Org mapping for department "EHS-Health"**
- Business Unit: **EHS** → BU Head = **Amit Kumar Sharma (102050)**, active.
- Department Head (EHS-Health) = **Firoz Ahmad (100801)**, active. (Firoz also heads EHS-Safety and EHS-Health And Safety; his own profile sits in EHS-Safety.)

So "Feroz" is already the mapped Department Head. The only reviewer to remove is the **BU Head (Amit Kumar Sharma)**. No stray manager/skip/HR/management stages exist on these instances.

**Instances in the active cycle: 12 employees**

| Code | Name | Status | enabled_stages | Dept-head response |
|---|---|---|---|---|
| 100374 | Abhimanyu Barik | pending_dept | self, dept_head, bu_head | draft, 0/10 scored |
| 100505 | Pradeep Kumar | pending_dept | self, dept_head, bu_head | draft, 0/10 |
| 100586 | Pramod Kumar Singh | pending_dept | self, dept_head, bu_head | draft, 0/10 |
| 101248 | Vikram Rajwar | **pending_bu** | self, dept_head, bu_head | submitted, 10/10 |
| 101714 | Md Faiyaz Ansari | pending_dept | self, dept_head, bu_head | draft, 0/10 |
| 101758 | Vishal Kumar | pending_dept | self, dept_head, bu_head | draft, 0/10 |
| 101959 | Lekh Raj | pending_dept | self, dept_head | submitted, **0 criteria in template** (narrative-only), recommendation present |
| 101997 | Puja Kumari | completed | self, dept_head | submitted, 10/10, score 82 |
| 200114 | Jitendra Kumar | pending_dept | self, dept_head, bu_head | draft, 0/10 |
| 200449 | Abhishek Raj | **completed** | self, dept_head | submitted but **only 2 of 10 criteria scored** → total 31, rating "Poor" |
| 200552 | Baleshwar Bedia | pending_dept | self, dept_head, bu_head | draft, 0/10 |
| 200714 | Yogeshwar Kumar Mahto | pending_dept | self, dept_head, bu_head | draft, 0/10 |

Key issues:
1. 9 instances still carry `bu_head` (Amit Kumar Sharma) in the chain — contrary to the desired Self → Dept Head chain.
2. 101248 is parked at `pending_bu` waiting on the BU Head; once BU is removed it should become **completed**.
3. **200449 is completed on an incomplete review** — 8 of 10 criteria unscored, producing an artificially low 31 / "Poor".
4. 101959's template assigns **zero scoreable criteria to dept_head**, so its blank grid is legitimate narrative-only (ADR-197 classification) — but it is still `pending_dept` and needs Firoz to submit/advance.
5. 8 instances are simply awaiting Firoz's scoring (drafts with nothing entered).

## 2. Proposed changes

**Step A — Workflow correction (data, cycle-scoped)**
- For all 12 EHS-Health instances not yet finalised as correct: set `enabled_stages = ['self','dept_head']`, `bu_head_id = NULL`, `manager_id/skip_id/hr_id/management_id` left NULL (already NULL), and mark `has_admin_workflow_override = true` so later reseeds/cascade triggers do not re-add `bu_head`.
- Use the existing supported path (`set_annual_review_enabled_stages` / admin workflow-override RPC) rather than raw UPDATEs, so ADR-160/168 guards, audit rows and no-false-rewind rules (ADR-183/184) apply.
- 101248: with `bu_head` removed, advance `pending_bu` → **completed**, recomputing `total_score` / `final_rating` from the dept-head response (scale invariant per ADR-187).
- Completed rows (101997) are not touched.

**Step B — Guard against re-mapping**
- Add an explicit per-instance/department exclusion so the BU-head cascade triggers (ADR-109/head-master-authoritative) skip these instances; without this the next `business_units.head_user_id` edit would re-stamp Amit Kumar Sharma.

**Step C — Repair the defective completion (200449)**
- Re-open Abhishek Raj's dept-head stage (existing re-open path, ADR-160c/185), preserving the self review and the 2 existing scores, so Firoz completes the remaining 8 criteria. Current 31 / "Poor" is a data artefact, not a judgement.
- Alternative if you prefer no re-open: leave as is and record the exception. Please confirm which you want.

**Step D — Completion queue for Firoz**
- Produce the working list of the 9 instances awaiting his scoring (8 drafts + 101959 narrative-only) and surface them in the existing Annual Review admin **Unscored Stages** tab filtered to EHS-Health, so HR can track closure.
- Existing trigger `trg_ar_stage_score_required` already blocks any future submission with scoreable criteria left unscored, so no new instance can complete blank.

**Step E — Documentation**
- New ADR (ADR-198) + POLICY entry for department-scoped terminal-reviewer overrides, plus DOCUMENTATION.md update.

## 3. Risk & impact

- **Data**: only `enabled_stages`, reviewer-id columns and status of 10 instances in one cycle; all changes audited and reversible from the audit table. No schema change except an optional exclusion flag/table row.
- **Workflow**: Amit Kumar Sharma's queue shrinks by up to 9 items (intended). Firoz's queue is unchanged in size but becomes terminal.
- **Regression**: cascade triggers could re-add `bu_head` — mitigated by Step B; verification query re-run after the change.
- **Rollback**: restore prior `enabled_stages`/`bu_head_id`/status from the audit rows.

## 4. Confirmation needed

- Confirm **Firoz Ahmad (100801)** is the intended "Feroz".
- Confirm whether to **re-open 200449** (recommended) to capture the 8 missing ratings.
