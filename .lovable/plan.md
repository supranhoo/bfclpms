# Step 2 — Performance Console UI for central KPI values

Makes the ADR-301 server layer usable: a designated provider enters the month's number with evidence, submits it, and each configured approver approves or sends it back — all inside the Performance Console (`Admin → Performance Console`).

## What you will see

```text
KPI row in the console
  └── "Central data" panel (only for registered central KPIs)
        Value 1,04,320   Target 1,00,000   Evidence (3)
        Provider ▸ RM1 ▸ RM2 ▸ Dept Head ▸ BU Head ▸ HR/Audit ▸ Management
                    ^ here now, 2 days
        [Enter value]  [Submit]      (provider, before submit)
        [Approve] [Send back]        (only the approver whose turn it is)
```

1. **Central data panel** on the KPI detail modal, for KPIs registered in the central registry. Shows current value, target, evidence count, workflow stage, who holds it and for how long.
2. **Value entry dialog** — number (or Yes/No / tiered outcome, matching the KPI's scoring model), remarks, and multi-file evidence upload using the existing Org KPI evidence uploader. Saving keeps the row a draft; a separate **Submit** starts the ladder.
3. **Approval rail** — every step listed in order with its holder, decision, timestamp and comment, read from the immutable decision log. Sent-back steps show the reason inline.
4. **Approve / Send back** buttons, visible only to the actor whose step is current. Send back requires a reason and returns the row to the provider. The final step runs the fan-out and the panel then reports "propagated to N employees", linking to the existing impact sheet.
5. **Chain configuration dialog** (admin only) — register a KPI as central, pick its mode (`central_fed` default, or `central_approved`), set the cut-off day, and build the ordered step list (each step a named person or a role), with an effective-from date so changes do not rewrite history.

## Empty, loading and error states

- Not registered as central: the panel shows a short line plus, for admins, a "Set up central approval" button opening the chain dialog.
- Loading: skeleton rows shaped like the rail, not a spinner.
- Every failure surfaces the server's message in a toast; the dialog stays open with the entered value intact.

## Technical notes

**New files**

- `src/hooks/useOrgKpiCentralWorkflow.ts` — thin wrappers over the existing RPCs `org_kpi_central_config`, `org_kpi_effective_chain`, `org_kpi_chain_list`, `org_kpi_chain_upsert`, `org_kpi_submit_value`, `org_kpi_decide`, `org_kpi_finalise`. Every write runs `p_dry_run: true` first and surfaces the result before committing, matching the existing Console RPC pattern.
- `src/lib/review/centralApprovalModel.ts` — pure helpers: resolve current step, can-this-user-act, step status labels, ageing in days. Unit tested; no UI.
- `src/components/admin/bu-console/CentralValuePanel.tsx` — the panel.
- `src/components/admin/bu-console/CentralValueEntryDialog.tsx` — entry + submit.
- `src/components/admin/bu-console/CentralApprovalRail.tsx` — the step rail with approve / send-back actions.
- `src/components/admin/bu-console/CentralChainConfigDialog.tsx` — admin config.

**Changed**

- `KpiDetailDrawer.tsx` — render `CentralValuePanel` above the mapped-employee table when the KPI is registered as central. No change to existing group actions.
- Central row reads use the existing `org_kpi_values` org-scope row extended with `workflow_stage`, `current_step`, `submitted_at`, `propagation_mode` (read-only; existing consumers unaffected).

**Reused, not rebuilt** — evidence upload (`OrgKpiEvidenceManagerSheet` / `useOrgKpiEvidenceFiles`), scoring model resolution (`resolveKpiScoringModel`), capability gating (`useBuConsoleCapability`), propagation impact and rollback hooks.

**Tests** — `centralApprovalModel.test.ts` (turn resolution, role vs person match, send-back returns to provider, ageing) and a render test asserting the action buttons appear only for the current step's actor. Mock data covers a 7-step chain mid-ladder, a sent-back row and a finalised row.

## Risk & impact

- **Data:** no schema change; UI over the ADR-301 RPCs only.
- **Score integrity:** unchanged — finalisation, skips and POLICY §88 protection all stay server-side. The UI can only trigger what the RPCs already allow.
- **Workflow:** nothing changes for a KPI until an admin registers it; the registry is empty today, so the panel is invisible everywhere on day one.
- **Regression:** the KPI detail modal is shared with group entry/approval — the panel is additive and gated on registration, so existing paths are untouched.
- **Scale:** one extra query per opened KPI detail, keyed and cached; the rail reads at most a handful of decision rows.
- **Rollback:** delete the new files and the one render line in `KpiDetailDrawer`.

## Docs

`docs/adr/ADR-302.md` (Step 2 UI), POLICY §CONSOLE-CENTRAL-APPROVAL-SSOT extended with the actor-turn and send-back rules, and a DOCUMENTATION.md version entry.

## Then

Register "Achieve organization's production target" for all BUs in `central_fed` mode and run one month against your sheet before flipping it to `central_approved`.
