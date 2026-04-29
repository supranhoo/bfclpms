## Your Rule (the new contract)

For multi-month KPIs (Bi-Monthly / Quarterly / Half-Yearly / Yearly):

- The **terminal month** of each cycle is the only month that goes through the workflow (Self → Manager → … → Management → Approved).
- All **non-terminal sibling months** in the same cycle are placeholders — no user is allowed to enter or review anything on them.
- The instant the terminal month becomes `approved`, every sibling month in that cycle must:
  1. Have its `status` flipped to `approved`
  2. Have all stage scores, ratings, achieved values, remarks and evidence copied from the terminal month
  3. Mirror the terminal month's `final_score` permanently — even if the workflow template changes later

This replaces the current §54 "wait for sibling to reach its own terminal stage" guard, which was added in April to fix a different bug (auditor bypass) but contradicts your actual business model for multi-month KPIs.

---

## Why It Doesn't Work Today (Diagnosis Recap)

Confirmed against the live database for **Jitendra Dwivedi → "Power generation 45 MWh/AFBC" (Bi-Monthly Feb-Mar 2026)**:

| Month | Status | Final |
|---|---|---|
| March (terminal) | `approved` | 5 |
| **February (sibling)** | **`kra_set`** | — |

The DB trigger `percolate_multimonth_score` fired correctly when March was approved. It checked Feb, saw status was `kra_set` (below Feb's own terminal stage), and wrote a `PERCOLATION_DEFERRED` audit log instead of copying the score. Two such deferrals are recorded (Apr 9 and Apr 14). This matches POLICY §54 — but §54 is wrong for your business rule.

---

## The Fix

### 1. Rewrite the `percolate_multimonth_score` trigger (DB)

Remove the workflow-stage guard entirely for non-terminal siblings. New logic:

```text
On terminal-month KPI transition to 'approved':
  cycle_months = get_cycle_months(frequency, period, year, frequency_cycle_start)
  terminal_month = last month in cycle_months (chronologically)
  
  IF NEW.review_period != terminal_month THEN
    -- not the terminal month, skip
    RETURN
  END IF
  
  FOR each sibling KPI in same cycle (same employee, kra, kpi, year, frequency):
    -- Force-set status to approved (no stage guard)
    UPDATE kpis SET status = 'approved' WHERE id = sibling.id
    
    -- Upsert review_submissions with full snapshot from terminal
    INSERT ... ON CONFLICT (kpi_id) DO UPDATE SET ...
      auto_advance_reason = 'Multi-month sibling — auto-populated from terminal month {March 2026}'
    
    -- Audit log
    INSERT INTO kpi_audit_logs (action='SCORE_PERCOLATED', performed_by=auth.uid(), 
      metadata={source_kpi_id, source_period, frequency, forced=true})
  END FOR
```

Key changes vs current trigger:
- **Removed** the `v_sibling_terminal` lookup and the `IF v_sibling.kpi_status = v_sibling_terminal` branch
- **Removed** `PERCOLATION_DEFERRED` path — never defer, always apply
- **Added** an explicit guard so percolation only triggers when the **chronological terminal month** of the cycle is approved (prevents Feb-approval from overwriting an already-correct Mar)

Determining the terminal month uses the existing `get_cycle_months()` function with `frequency_cycle_start` — so "Feb-Mar" → terminal = March, "Apr-Jun" → terminal = June, etc.

### 2. Block UI entry on non-terminal sibling months

Today the UI lets a user accidentally start a Self-review on Feb. Add a guard so:

- **Self-Review screen** (`SelfReviewSheet.tsx`, `MobileSelfReviewCard.tsx`): if KPI is multi-month and current period is **not** the cycle's terminal month, show a read-only banner: *"This is a placeholder month for the {Feb-Mar} cycle. Score will auto-populate from {March} once approved. No action needed here."*
- **Reviewer screens** (`UnifiedScorecard.tsx`, `KpiDetailsTable.tsx`): same banner; hide submit/score inputs.
- **Admin Data Entry**: keep editable (admin override path) but show the banner.

### 3. Backfill historical deferred KPIs

Run a one-shot migration script that finds every KPI matching:
```sql
-- non-terminal sibling, status != approved, but terminal sibling IS approved
```
…and applies the new percolation logic retroactively. The `4f7d79d0-…` (Feb 2026 AFBC) and `cc08d11e-…` siblings I confirmed earlier will be cleaned up automatically. Audit log: `BACKFILL_MULTIMONTH_PERCOLATION` with `performed_by = NULL` (system action).

Estimated affected KPIs: I will report the exact count from a dry-run before applying.

### 4. Workflow-change immutability

You said: *"Even if the workflow is changed, final score should be same as what score is in the second month."*

Today, `assign_active_workflow_to_kpis_in_period` (the workflow-change step-back trigger from `mem://features/admin/workflow-change-step-back`) reverts KPIs when their workflow template changes. We must add an exception:

- If a KPI is a non-terminal multi-month sibling AND its terminal sibling is `approved`, the step-back trigger must **skip** it. The score is governed by the terminal month, not the local workflow.
- Add the same exception to any "reset" or "reconcile" tool.

### 5. Policy & documentation rewrite

- **POLICY.md §54** — replace text. New rule: *"For multi-month KPIs, only the chronologically terminal month of each cycle traverses the workflow. Non-terminal sibling months are placeholders, locked from user entry, and inherit the terminal month's full score snapshot atomically upon approval. The pre-April-2026 'auditor bypass' concern is mitigated instead by §54.1: only the terminal month's auditor signs off; siblings inherit that approval as a derivative artifact."*
- **POLICY.md §54.1** (new) — UI must prevent any user (Self / Manager / Auditor / Management) from entering data on non-terminal sibling months.
- **DOCUMENTATION.md** — update "Multi-Month KPI Percolation" section + Version History entry.
- **ADR-047** — add a third amendment dated today documenting the reversal of the §54 stage-guard, the business rationale, and the compensating control (UI lockdown of siblings).

### 6. Tests

- `src/test/multimonthPercolation.test.ts` (new) — assert that approving the terminal month flips a `kra_set` sibling to `approved` with identical scores.
- DB function test covering: Bi-Monthly Feb-Mar, Quarterly Jan-Mar, Half-Yearly cycles, and an off-fiscal cycle (e.g. Aug-Sep).
- Regression: assert the trigger does **not** fire when a non-terminal month is approved (e.g. someone manually approves Feb instead of March).
- UI test: SelfReviewSheet shows the placeholder banner on Feb of a Feb-Mar cycle, hides inputs.

---

## Risk & Impact

| Area | Impact | Mitigation |
|---|---|---|
| Data integrity | Medium — backfill rewrites historical sibling submissions. | Dry-run first; full audit log per row; reversible via `kpi_audit_logs` rollback. |
| HR audit / "auditor bypass" concern | The reason §54 was added in April. | Compensating control: siblings are locked from any user entry. The terminal month auditor IS the authority for the whole cycle — by design. POLICY §54.1 documents this explicitly. |
| Workflow template changes | Could previously revert siblings. | Step-back trigger updated to exempt approved-cycle siblings. |
| RLS | None — the trigger is `SECURITY DEFINER`. | — |
| Regression risk on single-month KPIs | None — trigger early-exits for `frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')`. | Existing single-month tests retained. |
| UI users seeing locked Feb | Behavioural change. | Clear banner explains why; matches business intent. |

---

## Files Changed

**Database:**
- `supabase/migrations/<ts>_rewrite_multimonth_percolation.sql` (new) — trigger rewrite + backfill
- `supabase/migrations/<ts>_workflow_change_sibling_exemption.sql` (new) — step-back exemption

**Frontend (UI lockdown + banners):**
- `src/lib/cycleResolution.ts` (new) — client-side mirror of `get_cycle_months` to detect terminal vs placeholder month
- `src/components/review/SelfReviewSheet.tsx`
- `src/components/review/MobileSelfReviewCard.tsx`
- `src/components/review/UnifiedScorecard.tsx`
- `src/components/review/KpiDetailsTable.tsx`
- `src/components/dashboard/KpiTrackerModal.tsx` — show "auto-populated from {month}" caption on percolated rows

**Tests:**
- `src/test/multimonthPercolation.test.ts` (new)
- `src/test/cycleResolution.test.ts` (new)
- `src/test/siblingLockdown.test.ts` (new)

**Docs / Memory:**
- `POLICY.md` — §54 rewrite + §54.1 new
- `DOCUMENTATION.md` — Multi-Month section + Version History
- `docs/adr/ADR-047.md` — third amendment
- `mem://architecture/pms/multimonth-percolation` (new memory rule)
- `mem://index.md` — add reference

---

## Two Decisions I Need From You

1. **Backfill scope** — apply the new rule retroactively to **all** historical KPIs (recommended, fixes Jitendra's Feb today and any other quietly deferred siblings), or only from a cutoff date forward (e.g. FY 2025-26 onward)?

2. **Sibling UI lockdown strictness** — should Admin (via Admin Data Entry) still be able to manually edit a placeholder sibling for exceptional repairs, or fully locked for everyone including Admin? My recommendation: Admin keeps an explicit override (audit-logged), all other roles fully locked.

Approve and I'll implement.
