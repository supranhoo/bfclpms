## 1. Audit findings — department "EHS-Safety" (read-only, verified)

- Department id `49bb719c-69b6-449e-b35c-991a52c58898`, Business Unit **EHS**.
- **BU Head (to be excluded): Amit Kumar Sharma (102050)** — active, mapped as BU head for all EHS departments.
- **Department Head: Firoz Ahmad (100801)** — active; he is already the mapped dept head and the intended final reviewer.

**18 active annual review instances (25 employees are in the department — 7 have no instance, listed below).**

| Code | Name | Status | Stages | Self | Dept-head response | Notes |
|---|---|---|---|---|---|---|
| 100228 | Rahul Kumar Singh | pending_dept | self, dept_head, bu_head | done 10/10 | draft 0/10 | awaiting Firoz |
| 100640 | Ramanand Kumar | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 100722 | Nand Kumar | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 100747 | Bilendra Bedia | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 100757 | Kanhaiya Kumar Singh | **pending_bu** | self, dept_head, bu_head | done | submitted 10/10 | completes once BU removed |
| 100801 | **Firoz Ahmad (dept head himself)** | pending_management | self, bu_head, **management** | submitted (narrative template) | n/a | see §4 |
| 100857 | Avinash Prasad Sinha | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 100890 | Firdoush Alam | pending_dept | self, dept_head | narrative | submitted, **0 scoreable criteria in template** | narrative-only (ADR-197), needs Firoz to submit |
| 101279 | Dipak Kumar Chandara | **pending_bu** | self, dept_head, bu_head | done | submitted 10/10 | completes once BU removed |
| 101292 | Rajesh Kumar Chand | pending_dept | self, dept_head, bu_head | done | submitted 10/10 | status lags behind a complete dept response — needs advance |
| 101983 | Prashant Kumar Singh | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 101985 | Akash Kumar Choudhary | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 102001 | Rahul Kumar | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 102008 | Sujal Haldar | completed | self, dept_head | done | 10/10 | correct (80.00 / Good) |
| 102009 | Manoranjan Kumar Barik | completed | self, dept_head | done | 10/10 | correct (81.00 / Good) |
| 200563 | Mritunjay Kumar Thakur | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 200611 | Vishal Ray | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |
| 200839 | Ramesh Ekka | pending_dept | self, dept_head, bu_head | done | draft 0/10 | awaiting Firoz |

No manager / skip / HR stages exist on these instances; only `bu_head` needs removing (13 instances still carry it).

**Employees with no annual review instance at all (7):** 100768 Shaikh Masuk Ali, 100863 Alok Kumar Mishra, 101158 Md. Akif Ansari, 101211 Manoj Kumar, 101749 Deepak Ray, 101966 Vedant Pawar, 200557 Rajat Kumar. Reported only — not seeded in this change unless you ask.

No defective completion exists here (unlike EHS-Health 200449): both completed rows have full 10/10 dept-head scoring.

## 2. Changes to apply (same pattern as ADR-198 / §AR-DEPT-TERMINAL-OVERRIDE)

**Step A — Contract the chain to Self → Dept Head**
- For the 13 instances carrying `bu_head`: remove it from `enabled_stages`, set `bu_head_id = NULL`, set `has_admin_workflow_override = true` (so the hardened BU-head cascade triggers skip them permanently).
- Excludes Firoz's own instance (100801) — handled in §4.

**Step B — Unstick the three instances whose dept-head review is already complete**
- 100757 Kanhaiya Kumar Singh: `pending_bu` → **completed**.
- 101279 Dipak Kumar Chandara: `pending_bu` → **completed**.
- 101292 Rajesh Kumar Chand: dept-head response is locked and 10/10 but status is still `pending_dept` → advance to **completed**.
- For each, recompute `criteria_weighted_score`, `total_score`, `final_rating` via `annual_review_compute_final_summary` (scale invariant, ADR-187). No score is invented.

**Step C — Audit + reversibility**
- Before/after snapshot of every touched instance into `annual_review_bu_removal_repair_2026_07` with reason "EHS-Safety terminal dept-head override".

**Step D — Verification**
- Re-query the department: every instance must show `enabled_stages = [self, dept_head]`, `bu_head_id = NULL`; no instance left in `pending_bu`.
- Report the outstanding list for Firoz (10 blank drafts + 1 narrative-only submit).

**Step E — Documentation**
- Extend `docs/adr/ADR-198.md` with the EHS-Safety cohort (same policy clause, no new clause needed) and add DOCUMENTATION.md / POLICY.md version-history lines.

## 3. Data captured / ratings check (your specific ask)

- Complete and rated: 100757, 101279, 101292, 102008, 102009 (10/10 each).
- **Nothing captured yet (blank drafts, 0 of 10 rated):** 100228, 100640, 100722, 100747, 100857, 101983, 101985, 102001, 200563, 200611, 200839 — Firoz must score these; the system cannot advance them without ratings (`trg_ar_stage_score_required`).
- Narrative-only by template design: 100890 Firdoush Alam — no scoreable criteria at dept-head stage, only a written recommendation is required, then submit.

## 4. Firoz Ahmad's own review (100801) — needs your decision

His instance runs `self → bu_head → management` and currently sits at **Management review** (management reviewer already assigned). He obviously cannot review himself. Options:
1. **Leave as is** (recommended) — Management is a valid, senior terminal reviewer for the dept head.
2. Remove `bu_head` from his chain too, leaving `self → management`.
Note his BU-head stage is still mapped to Amit Kumar Sharma but the instance has already passed it.

## 5. Risk & impact

- **Data**: 13–16 instances in one cycle; only `enabled_stages`, `bu_head_id`, status and recomputed aggregates. Fully audited and reversible.
- **Workflow**: Amit Kumar Sharma loses 13 EHS-Safety items from his queue (intended). Firoz's queue size unchanged but becomes terminal.
- **Regression**: cascade re-mapping already mitigated by the override guard shipped with ADR-198; verification query re-run after the change.
- **Rollback**: restore prior state from `annual_review_bu_removal_repair_2026_07`.
