
# Fix: Jan 2026 frequency drift on Atul's "Accuracy of TDS Workings" KPI

## 1. What's wrong (confirmed from DB)

The KPI is Quarterly (Jan-Mar cycle, terminal = March 2026). Every sibling month is `frequency = Quarterly` **except January 2026**, which is still `frequency = Monthly` and was approved on the old **HR PMS** workflow chain before the KPI was reclassified.

Consequence:
- The multi-month percolation trigger ignores the Jan row (frequency mismatch with terminal).
- Jan keeps its stale `hr_pms_score = 5` and renders the **HR PMS card** in the Review Journey instead of the Quarterly **Auditor card** that Feb/Mar/Dec show.
- This is the exact RC-2 "Frequency Drift" case the v5 plan was built for — repair just hasn't been applied for this row yet.

No other KPI scoring is wrong; final_score = 5 across the cycle. The bug is purely **stage rendering + frequency-tag drift** that breaks SSOT and will block any future re-percolation / step-back on this cycle.

## 2. Risk & Impact Report

| Dimension | Assessment |
|---|---|
| Data Impact | Updates 1 `kpis` row (frequency Monthly → Quarterly) and clears stale stage fields on 1 `review_submissions` row (hr_pms_*). Final score preserved (re-percolated from March terminal = 5). |
| Workflow Impact | None — KPI already approved; we only realign the stage chain to the cycle's Quarterly workflow. |
| UI Impact | Jan card in "Previous Months" will switch from HR PMS → Auditor (matching Feb), with the existing "Cycle reviewed via terminal month" badge. |
| RLS / Security | No policy change. Repair runs via existing admin-only `repair_sibling_frequency_drift_v5` SECURITY DEFINER RPC. |
| Regression Risk | Low. Repair is scoped by `(employee_id, kra_name, kpi_name, cycle)`. Final score is re-derived from terminal, so audit trail stays intact. Adds an audit-log entry `FREQUENCY_DRIFT_REPAIRED`. |
| Mitigation | Run repair in dry-run first, show the admin a preview, require explicit Apply. Add a unit test asserting drift detection + re-percolation. |

## 3. Plan

### 3.1 DB — harden the v5 repair RPC (single migration)

Extend `repair_sibling_frequency_drift_v5(p_apply boolean default false)` so that, in addition to fixing `kpis.frequency`, it also:

1. **Clears stale stage fields** on the affected sibling submissions for stages that are NOT part of the terminal's workflow chain (e.g. wipes `hr_pms_score / hr_pms_rating / hr_pms_remarks / hr_pms_*_evidence_url(s) / hr_pms_achieved_value` when terminal chain has no HR PMS stage).
2. **Re-invokes** `percolate_multimonth_score(terminal_kpi_id)` for every cycle it touched, so siblings inherit the terminal's stage scores + `auto_advance_reason = 'Multi-month sibling — auto-populated from terminal month <Mon YYYY>'`.
3. **Writes one `kpi_audit_logs` row per repaired sibling** with `action_type = 'FREQUENCY_DRIFT_REPAIRED'`, metadata `{ from_frequency, to_frequency, terminal_kpi_id, cleared_stages: [...] }`, `performed_by = NULL` (system).
4. Stays **dry-run by default**; returns `{ would_repair: int, samples: jsonb[], cleared_stages_summary: jsonb }`.

Migration name: `multimonth_frequency_drift_repair_v5_hardening`.

No schema changes; trigger signatures unchanged.

### 3.2 UI — surface the new clear-stage info in the admin DataRepair card

Update `MultimonthWorkflowDriftCard.tsx`:
- Add a second tab/row "Frequency Drift Repair" alongside the existing "Workflow Drift" scan.
- Calls `repair_sibling_frequency_drift_v5(false)` for dry-run, lists affected (`employee`, `kpi`, `period`, `from_freq → to_freq`, `cleared_stages`).
- "Apply Repair" button calls it again with `(true)`, shows toast with count, refreshes the list.
- Reuses existing `ConfirmDestructiveDialog` per Core directive.

No new component files; extend the existing card.

### 3.3 Targeted repair for Atul's Jan-2026 row

In the same migration, append a one-shot guarded `DO $$ … $$` block that calls `repair_sibling_frequency_drift_v5(true)` **scoped via a new optional `p_kpi_id uuid` filter** so production data only touches the known-bad row (`edb28424-74a9-40f5-87d6-bdb189ccfe26`). All other drifts must still be reviewed in the UI dry-run.

After repair the row should show:
- `kpis.frequency = 'Quarterly'`
- `review_submissions.hr_pms_* = NULL`
- `review_submissions.auditor_score = 5`, `auditor_remarks = 'no notices receievd'`
- `auto_advance_reason = 'Multi-month sibling — auto-populated from terminal month March 2026'`
- UI: Jan card renders Self / Manager / Auditor (matches Feb).

### 3.4 SSOT sync

- `POLICY.md` §54 v5.1 — add: "Frequency drift on a sibling row also requires clearing stage fields outside the terminal's workflow chain before re-percolation."
- `DOCUMENTATION.md` — version-history entry for `v5.1` describing the hardened repair RPC and the Jan-2026 one-shot.
- `mem://features/admin/enhanced-kra-rollover-system` — append note about frequency-drift cleanup.

### 3.5 Regression protection

- New unit test `src/test/multimonthFrequencyDriftRepair.test.ts`:
  - Mock cycle: 3 siblings, one tagged Monthly with stale `hr_pms_score`.
  - Assert dry-run reports it; apply mode flips frequency, nulls hr_pms_*, copies terminal's auditor score, writes audit log.
- Mock data fixture extends existing `multimonthWorkflowAlignment` mocks.

## 4. Files to change

- **New**: `supabase/migrations/<ts>_multimonth_frequency_drift_repair_v5_hardening.sql`
- **New**: `src/test/multimonthFrequencyDriftRepair.test.ts`
- **Edit**: `src/components/admin/MultimonthWorkflowDriftCard.tsx`
- **Edit**: `POLICY.md`, `DOCUMENTATION.md`, `mem/index.md` (+ append to the rollover memory file)

## 5. Out of scope

- Bulk system-wide frequency repair (admin can run via the new UI tab when ready).
- Any change to scoring logic or final_score values.

---

**Approve to implement.** I'll ship the hardened RPC + UI + targeted Jan-2026 fix + tests + SSOT updates in one change.
