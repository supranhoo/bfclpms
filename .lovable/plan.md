# RCA — Nitesh Kumar Baldwa (100012) Team Annual Review population

## Current Reporting Relationship

- Nitesh Kumar Baldwa (100012, Senior DGM) reports to **Gaurav Budhia (100001)** in `profiles.reporting_manager_id`.
- Per current org master, Nitesh has **only 6 direct reports**:
  100200 Manoj K. Choudhary, 100327 Swaraj Mukhopadhyay, 100355 Ashish K. Gupta, 100397 Sachchidanand Shukla, 101394 Nitin Agrawal, 101906 Bijay K. Mandal.
- His true skip-level population (reports-of-those-6) is a small set — nowhere near 40.

## Review Eligibility Analysis (why the queue shows 40)

`annual_review_instances` for cycle **Annual Review 2025-2026** contains **40 rows** where `manager_id`, `skip_id`, `dept_head_id`, or `bu_head_id` = Nitesh. The Team page unions all four slots. Breakdown of what's inflating the list:

| Bucket | Count | Example rows | Problem |
|---|---|---|---|
| `manager_id` = Nitesh (real direct reports) | 2 in queue view (100200, plus his own instance 100012) | ok | legitimate |
| `skip_id` = Nitesh but employee's current manager rolls up through **someone else** (Sajid Raza / Piyush Bansal / Jaspal / RAKESH K. GUPTA / Parshu Ram / Sindhu Raj / Dippendu / Rupesh / Brundaban) | ~35 | e.g. 100004 Indar Prasad → mgr 102028 Brundaban → currently rolls to Gaurav Budhia, **not** Nitesh | **stale snapshot** |
| `dept_head_id` / `bu_head_id` = Nitesh on **100000 Hari Krishna Budhia (MD)** | 1 | MD's dept/BU head set to a Sr DGM | **config error** |
| Test profile **001 "Dummy — hr test"** included in cycle with skip=Nitesh | 1 | Test row, mgr = Jaspal | **should be excluded/deactivated** |

## Root Cause

Two independent issues, both traced against `mem://features/annual-review/head-master-authoritative`:

1. **Stale reviewer-chain snapshot (primary).** The cycle was seeded (or last cascaded) when Nitesh sat higher in the chain — e.g., over Sajid Raza / Brundaban / Jaspal / RAKESH K. GUPTA / Piyush Bansal / Parshu / Sindhu / Dippendu / Rupesh. Master has since been re-parented so those managers now roll up to **Gaurav Budhia**. Head-master trigger (`trg_cascade_department_head_change` / `_bu_head_change`) only cascades **dept_head / bu_head** — **manager_id and skip_id are NEVER auto-cascaded**. As a result, ~35 instances carry Nitesh in their `skip_id` slot even though today's reporting_manager_id chain no longer routes through him.
2. **MD + test-account contamination.** `100000 Hari Krishna Budhia` (Managing Director) and `001 Dummy — hr test` were seeded into the cycle with Nitesh in head/skip slots. MD should either be excluded or bound to a dedicated top-of-house rule; the "Dummy" row is a test artifact that should not exist in a prod cycle.

## Supporting Evidence

- `profiles`: Nitesh → mgr Gaurav Budhia; 6 direct reports (list above).
- `annual_review_instances` (cycle `b82a935f-05a3-4a18-a65c-215d2ef16c4c`): 40 rows tie to Nitesh across the 4 reviewer slots.
- Cross-check on `skip_id=Nitesh` rows: the employee's current `reporting_manager_id → reporting_manager_id` chain resolves to **Gaurav Budhia (100001)** for every listed manager (Sajid Raza, Piyush Bansal, Jaspal, RAKESH K. GUPTA, Parshu Ram Shukla, Sindhu Raj Singh, Dippendu Das, Rupesh V. Dalvi, Brundaban Chandra Das) — none currently roll through Nitesh.
- Policy: §AR-HEAD-MASTER-AUTHORITATIVE cascades **only dept_head / bu_head** pre-approval; **manager/skip drift is not covered** by triggers or by `resyncDeptHead.ts`.

## Recommended Actions

Nothing to build until you approve; below is the corrective sequence I'd execute in build mode.

1. **Resync reviewer chain for cycle 2025-2026** — recompute `manager_id` and `skip_id` from current `profiles.reporting_manager_id` for every instance still at `pending_self` / `pending_manager` / `pending_skip` (per §AR-REVIEWER-RESYNC gate). Audit the change into `annual_review_head_remap_audit_2026_07`. Expected effect: ~35 stray rows leave Nitesh's queue and re-anchor to Gaurav Budhia (or the correct skip).
2. **Extend head-master cascade to manager/skip changes** — add `trg_cascade_manager_change` + `trg_cascade_skip_change` (pre-approval only) so future re-parents don't silently strand instances. Update `mem://features/annual-review/head-master-authoritative` and POLICY §AR-HEAD-MASTER-AUTHORITATIVE with the new invariant, plus regression tests.
3. **Fix MD (100000 Hari Krishna Budhia) instance** — either exclude the MD from cycle seeding via `annual_review_assignment_rules`, or map dept_head/bu_head to the Chairman / self-terminating stage; do not carry Nitesh in those slots.
4. **Purge/deactivate the "001 Dummy" test profile** — remove from `annual_review_instances` and set `is_active=false` on the profile so future cycles never seed it.
5. **Guardrails** — add a scheduled diagnostic that flags any AR instance where `skip_id` ≠ `profiles.reporting_manager_id → reporting_manager_id` of the employee (analogue to `TeamReviewsZeroDiagnostic`), so drift is surfaced immediately in future cycles.

## Data / Workflow / UI / Regression Impact

- **Data:** Step 1 rewrites `manager_id`/`skip_id` on ~35 rows; fully audited, reversible from the audit table. Step 3 rewrites 1 row. Step 4 deletes 1 instance + deactivates 1 profile.
- **Workflow:** Only pre-approval instances touched; approved/completed instances remain frozen per policy.
- **UI:** Nitesh's queue shrinks from 40 → ~7 (his 6 direct reports + skip-level rollup of those 6). Gaurav Budhia's queue grows by the same delta.
- **Regression:** Add unit tests for the new manager/skip cascade triggers and the drift diagnostic. No client code changes required for Step 1 alone.
- **Rollback:** All chain rewrites replayable from `annual_review_head_remap_audit_2026_07`.
