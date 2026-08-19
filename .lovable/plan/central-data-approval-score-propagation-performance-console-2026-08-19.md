# Central Data Approval → Score Propagation (Performance Console)

## What you are asking for
One number, entered once by a designated data provider, walked through an approval
ladder, and — on final approval — turned into every mapped employee's score for that
KPI, with the evidence and history kept in PMS. Production is the pilot; Maintenance,
Budget vs Actual, Manning norm, Training records and Safety follow one at a time.

## Where we already are (verified today)
- `org_kpi_values` is already the central record: one row per scope (org / department /
  employee) per period, carrying target, achieved value, R5–R0 bands, UoM, criteria,
  evidence files, remarks, revision + send-back fields.
- It already has a lifecycle, but a shallow one — live rows are
  `draft (5) → pending (61) → entered (88) → approved (57) → propagated (4,595)`.
  There is **one** approval hop, not a ladder.
- Propagation into employee `kpis` / `review_submissions` already exists
  (`usePropagateOrgKpiValue`, preview / rollback / repair hooks), and the frozen-snapshot
  rule (POLICY §88) means propagation writes a value, never a live link.
- Ownership already exists (`org_kpi_data_owners`), and the Console already resolves
  scope, stages and per-employee workflows.

So the gap is not "build a data pipeline" — it is: **the central record has no
multi-stage workflow of its own, and approving it does not close the employees'
review stages.** That is what this project adds.

## The model we will build

```text
   Data provider (designated owner)          <- enters value + evidence, submits
             |
   RM1 -> RM2 -> FM1 -> Dept Head -> BU Head <- approve the VALUE, once
             |
   HR PMS / Audit
             |
   Management                                 <- final approval
             |
   =====  APPROVED  =====
             |
   Propagation fan-out to every mapped employee:
     achieved value copied (frozen snapshot)
     rating recomputed per employee from THEIR target + R5..R0 row
     if KPI is "central-approved": their stages auto-close with audit rows
     if KPI is "central-fed":      value lands, their normal review still runs
```

### Decisions locked from our discussion
1. **Configurable per KPI.** A KPI is either `central_approved` (value approval closes
   the employees' stages for that KPI) or `central_fed` (value lands, per-employee
   review continues). Default for existing KPIs stays `central_fed` — nothing changes
   until an admin opts a KPI in.
2. **Approvers configured per KPI**, not resolved from an employee's chain. Admin names
   the ordered approver list in the Console (provider, then each approving role/person,
   then HR-PMS/Audit, then Management). Explicit beats clever — no resolver surprises,
   and it is the same list every month.
3. **Same value, per-employee bands.** The approved achieved value is copied to every
   mapped employee; the 0–5 rating is recomputed per employee against their own
   target/threshold row, so tiered targets keep working.
4. **Pilot = "Achieve organization's production target", all BUs.** 228 org-level KPI
   rows across 40 employees for 2025–26 sit under that name today. No other family is
   touched until the pilot has run one clean month end-to-end.

## What gets built

### Data
- `org_kpi_approval_chains` — ordered approver steps per KPI definition (category + KRA +
  KPI name) per scope, with an `effective_from` so chains can change without rewriting
  history.
- `org_kpi_approvals` — one immutable row per step decision (approve / send back / who /
  when / comment). This is the audit trail, and it is what the MIS KPI reads.
- `org_kpi_values` gains `workflow_stage`, `current_approver_step`, `submitted_at` and a
  `propagation_mode` (`central_approved` | `central_fed`). Additive columns only.
- A central-KPI flag marks which KPI definitions are centrally sourced, so the
  employee-side UI can say "scored from central data" instead of showing an empty field.

### Server (RPCs, SECURITY DEFINER, no client writes)
- `org_kpi_submit_value` — provider submits; validates value, evidence and period.
- `org_kpi_decide` — one approver step: approve / send back with reason. Refuses out-of-turn
  actors, refuses locked periods, refuses rows already propagated.
- `org_kpi_finalise` — fires on the last step: recomputes each mapped employee's rating from
  their own bands, writes the snapshot, and (in `central_approved` mode) closes their stages
  with `CENTRAL_VALUE_APPROVED` audit rows. Never touches a row with `final_score IS NOT NULL`.
- `org_kpi_chain_upsert` / `org_kpi_chain_list` — admin-only chain config.
- Dry-run first on every write, same pattern as the existing Console RPCs.

### UI (inside Performance Console, no new tab)
- Data entry cell for the designated provider, with evidence upload and remarks.
- An approval rail on the KPI row showing each step, who holds it, and how long it has sat.
- Approver's action = one click per step, with a mandatory reason on send-back.
- After approval, the KPI row shows "propagated to N employees" and links to the existing
  impact sheet.
- Admin dialog to configure the chain and the per-KPI mode.

### MIS / provider accountability
Timeliness of each provider (submitted before the cut-off, number of send-backs) is derived
from `org_kpi_approvals` — no new capture, and it can feed a provider KPI later.

## Risk & impact
- **Data:** additive columns and two new tables; no rewrite of existing rows. The existing
  propagation path is left intact and reused.
- **Score integrity:** POLICY §88 (frozen snapshots) and final-score immutability are
  hard stops — approved/locked employee rows are skipped and reported, never overwritten.
- **Workflow:** nothing changes for a KPI until an admin sets it to `central_approved`.
- **Regression:** the biggest risk is auto-closing stages for the wrong people; the
  fan-out therefore runs dry-run first, reports skips by reason, and is undoable through
  the existing rollback-propagation path.
- **Scale:** fan-out is batched server-side; the pilot is ~40 employees per month, well
  inside limits, but the RPC is written batched from day one.

## Sequence
1. Chain + approvals schema, RPCs with dry-run, tests. No UI.
2. Console UI: entry, approval rail, admin chain config.
3. Pilot the Production KPI for one month across all BUs in `central_fed` mode (value flows,
   reviews unchanged) — verify numbers match your sheet.
4. Flip the pilot KPI to `central_approved`, run one month, review the audit trail.
5. Roll the next family (Maintenance, then Budget vs Actual, Manning, Training, Safety).

## Open points to settle before step 1
- Cut-off date per period for providers, and what happens if they miss it.
- Whether send-back from a late step returns to the provider or to the previous approver.
- Whether Safety data should come from the Safety module instead of manual entry.