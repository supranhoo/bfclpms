## Problem

Ankit Choudhary's July rollover notification says **"13 KPI(s) … Total weightage: 126%"**, but his July KRA sheet actually has **9 KPIs summing to 100%** — matching the June roster.

## Root cause

`supabase/functions/auto-rollover-kpis/index.ts` handles multi-month KPI frequencies (Quarterly / Half-yearly / Annual) by inserting rows for every remaining month in the cycle when it rolls into the target month. For Ankit, the July rollover correctly inserted:

- 9 rows into July (100%)
- 2 rows into August (13%) — quarterly KPI (`On-time Completion … Director's Reportees`, 13%, cycle Jul→Sep… actually the pattern shows one quarterly KPI producing Aug + Sep records too)
- 2 rows into September (13%)

Total = 13 rows / 126%. That matches the notification exactly.

The bug is in the notification builder around lines 673–680 of `auto-rollover-kpis/index.ts`:

```ts
const copiedKpis = kpisToInsert.filter((k) => k.employee_id === empId);
const totalWeightage = copiedKpis.reduce((s, k) => s + (k.weightage || 0), 0);
const notifMessage = `${result.kpis_copied} KPI(s) have been rolled over from … Total weightage: ${totalWeightage}%.`;
```

`result.kpis_copied` and `copiedKpis` include every future-month row created for multi-month cycles, so a Quarterly KPI worth 13% is counted 3× (Jul + Aug + Sep). The actual "rolled over from June to July" set is only the target-month subset (should sum to 100%).

## Fix (surgical)

In `supabase/functions/auto-rollover-kpis/index.ts`, in the notification/email loop (~line 673–740), restrict counting to the target month only:

1. Compute `targetMonthCopied = copiedKpis.filter(k => k.review_period === targetMonth && k.review_year === targetYear)`.
2. Use `targetMonthCopied.length` for the message KPI count and `notifications.metadata.kpi_count`.
3. Sum weightage from `targetMonthCopied` for `Total weightage` in message and `total_weightage` in the email payload.
4. Use `targetMonthCopied` (not `copiedKpis`) to build `kraList` for the email so the table shows only what actually landed in the target month.
5. Leave `result.kpis_copied` (used by the RPC response / UI summary) untouched — it truthfully reports the total rows inserted, which is what admins running the rollover want to see.

No schema change, no policy change, no UI change. Existing notifications already stored in the DB are historical and remain as-is.

## Verification

1. Type-check the edge function.
2. Simulate: for Ankit's data, `targetMonthCopied.length === 9` and weightage sum === `100`.
3. Add / update unit test in `src/test/` (or a dedicated pure helper extracted from the loop) covering: single-month KPI → count matches; quarterly KPI targeting July → notification shows 1 KPI / X%, not 3× duplication.
4. Manually re-run the next monthly rollover in a lower env (or a dry-run branch) and confirm the message reads `9 KPI(s) … Total weightage: 100%`.

## Risk & impact

- **Data:** none — only in-app notification text and outbound email body change. Inserted KPI rows are unchanged.
- **Workflow:** none.
- **UI:** notification message wording changes for future rollovers only.
- **Regression:** low — the change is scoped to the notification block; the RPC response and admin summary still reflect full multi-month inserts.
- **Rollback:** trivial — revert the edge-function edit.

## Docs

- Add a note to `POLICY.md` (Rollover section) clarifying that the rollover notification reports the **target-month** KPI count/weightage, while multi-month cycles still insert forward-dated rows.
- Add a short ADR (next ADR-###) capturing the incorrect-weightage RCA.
