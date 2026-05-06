## Why-Why RCA — "Propagation issues" reported by Vivek Kumar Dansena (admin / Org KPI data owner for HR)

### Confirmed evidence (from `kpi_audit_logs`, `kpis`, `org_kpi_values`)

In the last 2 days of April 2026 propagations triggered by Vivek (`ca3897d0…`), every single push produced a `PROPAGATION_PARTIAL` audit row alongside `ORG_KPI_PROPAGATED`. Concrete examples for the same employees the RPC **skipped**:

| Employee | Period | child `kpis.status` | `review_submissions.self_score` | What Vivek pushed |
|---|---|---|---|---|
| Mandan Mishra | Apr | `self_review` | **5.00** | 0 |
| Preetam Sagar | Apr | `manager_check` | **5.00** | 0 |
| Prabhat Kr. Singh | Apr | `self_review` | **5.00** | 0 |
| Abhas Luharuwalla | Apr | `self_review` | **0.00** | 5 |
| Anil Kr. Pathak | Apr | `self_review` | **2.00** | 3 |

So the official Org KPI value **never reaches** these employees' submissions — managers/auditors review the employee's own self-entered number, not the data-owner's authoritative value.

### Why #1 — Why does propagation appear to "do nothing" for some employees?
The server RPC `public.propagate_org_kpi_value` skips any child whose `kpis.status <> 'kra_set'` and only inserts a `review_submissions` row when it can advance from `kra_set → self_review`.

### Why #2 — Why are children no longer in `kra_set`?
For Vivek's HR KRAs (Compliance, People Management, etc.), employees frequently complete their **self-review BEFORE the data owner pushes the official Org value**. Once the employee submits, the row moves to `self_review`/`manager_check`/`hr_pms_review`, and the RPC's `kra_set`-only guard refuses to overwrite.

### Why #3 — Why was the guard written that way?
The guard was added in May (POLICY §88.2 "benign skip" rule) to stop the propagation from clobbering a manager/auditor decision that was already in-flight. However the rule was scoped too aggressively: it also blocks the case where only the **employee** has self-reviewed but no reviewer has acted — which is precisely the data-owner's window to publish the canonical value.

### Why #4 — Why doesn't the UI tell Vivek that 80%+ of his "successful" propagations had no effect?
The toast counts `propagated_count` (status flipped) but `skipped` rows are reported as a single benign chip. There is no per-employee diff or red flag when a data-owner push silently leaves the employee's *wrong* `self_score` intact.

### Why #5 — Why is the result inconsistent across months?
- **Jan / Feb / Mar 2026** — Vivek's owned KPIs show `child_kra_set = 0` and 200+ propagated rows ⇒ data flow worked when employees were still in `kra_set`.
- **April 2026** — `child_kra_set = 14` of 107 still pending push; **95 OKV rows are status `propagated`** but several children have already moved to `self_review/manager_check` with mismatched scores → mid-cycle race.
- **May 2026** — `okv_status = 'draft'` for 59 rows over **3,481** child KPIs; nothing has been propagated yet because the OKV is still draft.

### Secondary findings
1. **Stale "entered" OKV rows for May** — KRA *Timely execution of new HR interventions* has 7 OKV rows with `status='entered'` but `achieved_value = NULL` (inserted by Jitendra Bharti). These confuse the dashboard's "Entered/Pending" count.
2. **Stuck-detection drift** — Page's "stuck" counter relies on OKV claiming `propagated/approved` while children still `kra_set`. The opposite case (OKV `propagated` but children in `self_review` with **wrong score**) is not surfaced anywhere.
3. **No idempotent re-push** — once OKV is `propagated`, Vivek can't re-trigger overwrite for late-self-reviewed employees without the admin manually using the Force-Overwrite path (`PA3`), which is hidden behind a confirm step.

---

## Risk & Impact Report
- **Data Impact**: Currently approved `final_score` rows that propagated cleanly are unaffected. The exposure is for KPIs still in `self_review`/`manager_check` where the employee number ≠ data-owner number.
- **Workflow Impact**: Reviewers will (or already did) approve incorrect employee-self values for ~200 HR KPIs. Need a "diff & overwrite" path that respects auditor/management decisions.
- **UI/UX**: Add a clear "Mismatched Values" badge per OKV; existing toast colour convention preserved.
- **Regression risk**: Medium — RPC change must keep "respect manager/auditor decisions" guarantee. Mitigate with new unit test + dry-run preview.

---

## Fix Plan

### Layer A — RPC: add a controlled overwrite tier (`policy = 'pre_review_only'` default)
Modify `propagate_org_kpi_value` (signature stable, add `p_overwrite_policy text DEFAULT 'pre_review_only'`):
- `pre_review_only` (new default): allow overwrite when `kpis.status IN ('kra_set','self_review')` **AND** `review_submissions.self_submitted_at IS NULL OR <data-owner is admin and OKV is authoritative>`. Always skip if status ∈ (`manager_check`, `auditor_check`, `management_review`, `final`).
- `force_pre_terminal`: admin-only — overwrite anywhere status not terminal/approved (used by the existing PA3 force path).
- `safe`: current `kra_set`-only behaviour (kept for compatibility).

In all overwrite paths the RPC also writes a `kpi_audit_logs` row `ORG_KPI_VALUE_OVERWRITTEN` with `{old_self_score, new_self_score, overwrite_policy}` so the change is auditable.

### Layer B — Dashboard surfacing
- New **"Value mismatch"** badge on the OKV card when `OKV.status = propagated` and at least one child `review_submissions.self_score <> OKV.derived_self_score`. Counts roll up into the existing Stuck/Pending header chips.
- Toast post-propagation lists per-employee diffs (`old → new`) in the existing Propagation Preview dialog component, not just a count.

### Layer C — Cleanup migration (one-shot, May 2026 cutoff per migration governance)
- Backfill: for **April 2026** OKV rows owned by Vivek where `OKV.status = 'propagated'` AND child still `self_review` with mismatched `self_score`, run the new RPC in `force_pre_terminal` mode and write audit rows. This is bounded (~14 rows) and reversible via `ORG_KPI_VALUE_OVERWRITTEN` log.
- Quarantine the 7 phantom May "entered" OKV rows (`Timely execution of new HR interventions`, `achieved_value IS NULL`) — soft-delete with audit trail.

### Layer D — Tests & docs
- New `src/test/orgKpiPropagationOverwrite.test.ts` covering: kra_set, self_review-no-reviewer-action, manager_check (skip), terminal (skip), force-overwrite admin path, audit-row emission.
- Update `mem://features/admin/copy-kras-org-kpi-integrity` and POLICY §88.2 with the new tiered policy.
- ADR-053 + CHANGELOG_2026 W2 row.

---

## Files to edit / create
- `supabase/migrations/<ts>_org_kpi_propagation_overwrite_policy.sql` — new RPC overload, audit action, optional cleanup block.
- `src/hooks/usePropagateOrgKpiValue.ts` — pass `overwrite_policy`, surface diff list in result.
- `src/components/admin/PropagationPreviewDialog.tsx` — show old → new per employee, mismatch warnings.
- `src/components/admin/OrgKpiEntryCard.tsx` — "Value mismatch" badge wiring.
- `src/pages/admin/OrgKpiDataEntry.tsx` — header chip for "Mismatched Values".
- `src/test/orgKpiPropagationOverwrite.test.ts` *(new)*.
- `docs/adr/ADR-053.md`, `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`, memory update.

Approve to implement.
