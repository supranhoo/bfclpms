## What the "Score Changed (Safety Net)" card actually is

This is **not** an automatic score recalculation. It is an **audit-only catch-net** written by the DB trigger `public.log_untracked_submission_changes()` (migration `20260505134535_…`).

That trigger fires on every `UPDATE review_submissions` and inserts a `SUBMISSION_SCORE_CHANGED` row into `kpi_audit_logs` **only when** one of these columns actually changed:
`self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score`.

It tags the row with `metadata.source = 'safety_net_trigger'` and stamps `performed_by = auth.uid()` (whichever user's session ran the UPDATE — in your screenshot, Shekhar Sharad).

## Why the UI shows it as a standalone card

`src/lib/timelineGrouping.ts` groups side-effect rows under the **human action** that ran in the same transaction-second (e.g. `AUDITOR_REVIEW_*`, `MANAGER_*`, `BULK_*`, `SCORE_PERCOLATED`, `STATUS_CHANGED`, …). When a safety-net row has **no companion human-action row in the same TX-second**, it is shown as an **orphan** card titled *Score Changed (Safety Net)*.

So the card on screen means exactly this:

> "A score column on this KPI was changed by an UPDATE statement that did **not** also insert a normal human-action audit row in the same transaction. The trigger caught it so the change is not invisible."

That is by design — it is a regression-protection rail, not a feature that mutates data.

## Likely sources of the orphan UPDATE (in priority order)

Candidates that update score columns without writing their own audit row in the same TX-second:
1. **Send-back / stage-clearing flow** — when a stage is sent back, downstream `*_score` fields are nulled by a code path that audits `STATUS_CHANGED` separately (often a different timestamp) → orphan safety-net row.
2. **Workflow Change Step-Back trigger** (`mem://features/admin/workflow-change-step-back`) — structural workflow edits revert dependent KPIs via DB trigger; the structural audit is on the *workflow* row, not the KPI row.
3. **Recall / Self-Review withdrawal** clearing higher-stage scores.
4. **Admin bypass / N/A clearing** (`mem://features/admin/admin-data-entry-workflow-controls`) when the client forgot to write a paired `ADMIN_*` audit row.
5. **Score percolation** running in a separate statement than its `SCORE_PERCOLATED` audit insert.

We can identify exactly which one applies by reading the audit row itself (it contains `old_value` and `new_value` JSONB blobs that pinpoint which column moved and from what → to what).

## Investigation plan (read-only)

Step 1 — Pinpoint the exact change
- Query `kpi_audit_logs` for the affected KPI around `2026-05-28 15:53:xx` and inspect the `old_value` / `new_value` of the safety-net row. The differing key reveals **which score column** changed.
- Query the **full audit trail for that KPI** (±2 minutes around 15:53) ordered by `created_at` to see what `STATUS_CHANGED`, `*_REVIEW_*`, `SEND_BACK`, `RECALL`, or `RECONCILE_STATUS` rows surround it. Same `performed_by` = same user session → same UI action.

Step 2 — Map to code path
- Match the column delta + surrounding actions to the code path list above. Use `rg` to confirm that path updates `review_submissions` but does **not** insert an explicit `kpi_audit_logs` row for the score change.

Step 3 — Decide remediation (only after RCA confirmed)
- If a legitimate code path is missing an audit insert → add the explicit audit row so the safety-net stops appearing orphaned (grouping will then nest it under the parent human action). No data-correction needed.
- If an unintended UPDATE path is mutating scores → fix that path or tighten RLS/WITH-CHECK.
- If the change was legitimate (e.g. admin correction) → no code change; document the case in `POLICY.md`.

Step 4 — Update `DOCUMENTATION.md` § Audit Trail and `POLICY.md` § Safety-Net Logging with the finding and any added audit insert.

Step 5 — Add a unit test to `src/lib/timelineGrouping.test.ts` covering the newly grouped pair (only if Step 3 adds an audit insert).

## What I need from you to start Step 1

Please share **one** of the following so I can read the exact audit row:
- The KPI id (uuid) of the row in the screenshot, **or**
- Employee name + KRA name + period (e.g. "Shekhar Sharad / Checking all the billing rates / April 2026") so I can look it up.

Once I have that, I will run read-only queries against `kpi_audit_logs` and `review_submissions` and come back with the definitive root cause (which column changed, from what to what, by which code path) before proposing any code change.

### Risk & Impact (for the investigation itself)
- Data Impact: None. Read-only queries.
- Workflow Impact: None.
- UI/UX Impact: None until Step 3.
- Regression Risk: None at investigation stage.
- Mitigation: All actions in Step 1 are `SELECT`s only.