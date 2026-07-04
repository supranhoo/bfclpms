# Fix: Weightage bulk-edit scopes ("forward" and "all") regress into past calendar months

## What the user reported
On the KPI Weightage matrix, editing a weightage with **"This & all following months"** — and also with **"All months"** — silently updates months that are in the **past calendar-wise**.

Reproduction — Anil Kumar Pathak (`200301`), today = 2026-07-04:
Two `forward` edits with `metadata.from_month = "July"`:

| Edit (audit ts)    | affected_count | Rows actually updated                        |
| ------------------ | -------------- | -------------------------------------------- |
| 15:13:37 (STI KPI) | 7              | Jan / Feb / Mar / Apr / May / Jun / **Jul** 2026 |
| 15:13:27 (other)   | 5              | Mar / Apr / May / Jun / **Jul** 2026             |

All of Jan–Jun 2026 are calendar-past. `all` scope has the same defect and additionally sweeps every earlier fiscal month in one click.

## Root cause
`src/components/admin/WeightageCellEditor.tsx`:

```ts
const MONTH_ORDER = ['July','August',…,'June']; // fiscal Jul→Jun
```

- `forward` iterates `MONTH_ORDER` starting at the clicked month's fiscal index. Clicking July (fiscal idx 0) selects **every** entry in `kpiIds`.
- `all` selects `Object.values(kpiIds)` unconditionally — every fetched month, past or future.
- `kpiIds` is keyed by month name only (`Record<string,string>`); it cannot distinguish Jul 2025 from Jul 2026, so calendar-time is invisible to the editor.

Result: both `forward` and `all` can rewrite months that are already in the past (and, per POLICY, often already reviewed / scored).

## Fix (surgical, UI-layer only)

1. **Thread `(month → review_year)` into the editor.** Add a new prop `kpiMonthYears: Record<string, number>` on `WeightageCellEditor`, populated from the dashboard's existing `getReviewYearForMonth(month, fiscalStartYear)` at the callsite in `KpiWeightageDashboard.tsx` (line ~575).

2. **Introduce a `notInPast(m)` predicate** based on `(kpiMonthYears[m], calendarIndex(m))` vs today's year/month. Any month strictly before the current calendar month is filtered out.

3. **`forward` scope** — becomes "clicked month or today, whichever is later, going forward in calendar time":
   - `anchorYM = max(clickedYM, todayYM)`
   - select `kpiIds[m]` where `(kpiMonthYears[m], calIdx(m)) >= anchorYM`.

4. **`all` scope** — becomes "all future-or-current months in the fetched window":
   - select `kpiIds[m]` where `notInPast(m)`.
   - Rename the radio label to **"All current & future months"** so the semantics match. Add a small `<Info>` tooltip: *"Past months are protected from bulk edits; edit them individually."*
   - If the user genuinely needs to edit a past month, the per-cell edit (`this` scope) still works — that path is unchanged.

5. **`this` scope — unchanged.** Single-month edits are always allowed; that is the escape hatch for corrections to past months.

6. **Empty-selection UX.** If a scope resolves to zero eligible months, disable Save and show inline text "No editable future months for this scope" instead of throwing a toast on click.

7. **Audit metadata upgrade.** Include `today: YYYY-MM` in `kpi_audit_logs.metadata` for `weightage_matrix_edit` so future incidents are traceable without reconstructing session time.

8. **One-time data repair for Anil Pathak.** For the two edits today with `from_month='July'` / `scope='forward'`, restore the pre-edit weightage on Jan–Jun 2026 rows for the 12 affected KPIs. Source of truth is `kpi_audit_logs.old_value.weightage`. One-shot `insert`-tool UPDATE keyed on `(kpi_id)` from the audit rows. Idempotent.

## Tests (`src/components/admin/WeightageCellEditor.test.tsx`, new)

Freeze `Date.now()` to 2026-07-04.

- **forward, FY 2026-27, click July** → selects Jul-Dec 2026 (6 rows). Does NOT include any 2027 row if fetch didn't return them.
- **forward, FY 2026-27, click September** → Sep-Dec 2026 only.
- **forward, FY 2025-26, click July** (kpiIds has Sep-Dec 2025 + Jan-Jun 2026) → **zero** rows selected; Save disabled with helper text.
- **all, FY 2025-26** (same kpiIds) → **zero** rows; Save disabled.
- **all, FY 2026-27** with kpiIds Jul-Dec 2026 → 6 rows selected.
- **this scope** — always selects exactly the clicked month, including a past month (regression guard for the escape hatch).
- **Audit metadata** contains `today` field.

## SSOT sync

- `DOCUMENTATION.md` — new entry: "Weightage matrix — `forward` and `all` scopes are calendar-forward; past months are protected."
- `POLICY.md` §KPI Weightage Governance — new invariant:
  > Bulk weightage edits (`forward`, `all`) MUST NOT modify months whose calendar date is strictly before the current month. Single-month (`this`) edits remain the only path for correcting historical months and are already governed by the existing lock/variance-ack rules.

## Risk & Impact

- **Data:** Only one write path affected; no schema change. One-time repair reverses only rows in the two identified audit events.
- **Workflow:** Bulk semantics tightened — past months become read-only for `forward`/`all`. Historical corrections still possible via `this`.
- **UI/UX:** Label change on the `all` radio; disabled Save with helper text when scope resolves to zero; tooltip on `all`. No layout change.
- **Regression risk:** Low. `this` scope untouched; existing hook + fetch untouched.
- **Rollback:** Revert the editor + dashboard diff; the one-time repair is idempotent.

## Files touched

- `src/components/admin/WeightageCellEditor.tsx` — new prop, `notInPast` predicate, rewritten `forward`/`all` branches, disabled-Save UX, audit metadata
- `src/pages/admin/KpiWeightageDashboard.tsx` — pass `kpiMonthYears` to editor
- `src/components/admin/WeightageCellEditor.test.tsx` — new
- `DOCUMENTATION.md`, `POLICY.md` — sync
- One-time data repair via `insert` tool (Anil Pathak, 12 rows)
