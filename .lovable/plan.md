# July 2026 Org KPI parity — why entry cards are missing, and the fix

## What the data actually says (verified, July 2026)

| Fact | Count |
| --- | --- |
| Distinct org-level KPI definitions for July | 199 |
| Definitions with no active mapped employee (correctly hidden) | 5 |
| Definitions the entry page shows ("All (166)") | 166 |
| Definitions hidden because they are multi-month | 22 |
| Monthly definitions with no value entered yet (genuinely pending) | 108 |

So nothing is lost in propagation or KRA mapping: every KPI on the employee
scorecard exists in the backend with its category and employee mapping. Two
separate things create the "KPI names are not appearing" experience.

## Root cause 1 — multi-month KPIs are hidden, silently (22 definitions)

Bi-Monthly and Quarterly KPIs are entered in the **last** month of their cycle
(Jul-Aug → entered in August; Jul-Sep → entered in September). The entry page
therefore filters July out of the list entirely, with no trace on screen. The
employee scorecard, correctly, still lists the KPI in July as "KRA Set" with a
blank value. Master and console disagree visually even though both follow the
rule.

Affected: 19 Bi-Monthly Jul-Aug definitions (Power generation 8 MWh / 45 MWh
AFBC / WHRB, Costing, Enhance Campaign Life), 2 Quarterly Jul-Sep
("New vendor addition"), 1 anchorless Bi-Monthly.

### 5 Why

1. KPI missing from July entry → filtered by the frequency lock.
2. Why invisible → the filter removes the card instead of showing it as not-yet-due.
3. Why removed → the list was designed as "what can I type into today".
4. Why that misleads → the employee side shows the same KPI in July, so the two surfaces read as inconsistent.
5. Why unnoticed → no counter reconciles "definitions for this period" against "definitions shown".

## Root cause 2 — one Bi-Monthly definition has no cycle anchor

"Achieve organization's production target → Power generation from 45 MWh/WHRB"
(13 employee rows) has `frequency_cycle_start = NULL`, so its lock month comes
from the global default rather than its real Jul-Aug cycle. This is the exact
silent-default risk POLICY §128 warns about.

## Root cause 3 — 108 monthly definitions are simply un-entered

These are visible on the entry page under **Pending**; they show blank on the
scorecard because no one has entered July values yet. Not a defect — but the
progress card reads "10 of 10 entered / 100%" when a data-owner tile is
selected, which reads as "everything is done".

## Fix

1. **Show, don't hide.** Multi-month definitions whose cycle covers the selected
   month appear in the list as a read-only card badged
   *"Bi-Monthly (Jul-Aug) — entry opens in August"*, grouped under a new
   **Not yet due (22)** status chip. Existing chips and counts are unchanged;
   the "All" count becomes the true definition count for the period.
2. **Repair the anchor.** Set `frequency_cycle_start = 'Jul-Aug'` on the 13
   anchorless rows through the existing cycle-anchor repair path, audited.
3. **Honest progress.** When an owner tile is active the progress card is
   labelled with the owner's name and the period-wide pending count stays
   visible, so 100% can never mean "100% of everything".
4. **Reconciliation line** (admin only): `definitions 199 · unmapped 5 · not yet
   due 22 · shown 172`, so any future divergence is visible on the page itself.
5. **July sync.** Materialise the missing `org_kpi_values` scope rows for the
   166 monthly definitions so every card renders its parity/evidence chips and
   the Pending Report lists every assignment. Idempotent; creates no values.

## Risk and impact

- **Data:** only additive — one anchor correction plus empty scope rows. No
  score, value or status is written.
- **Workflow:** unchanged. Not-yet-due cards cannot be typed into; the August
  entry window behaves exactly as today.
- **Regression:** the frequency lock helper is untouched, so scorecards,
  reminders and reports keep their current behaviour. Only the entry page's
  presentation of locked definitions changes.
- **Scale:** counts derive from the snapshot already loaded; no extra query.
- **Rollback:** revert the page changes; the anchor repair is reversible from
  its audit row.

## Technical notes

- `src/pages/admin/OrgKpiDataEntry.tsx` — keep locked definitions in
  `frequencyFilteredKpis`, tag each with `entryWindow: 'open' | 'not_due'`, add
  the chip, disable the card's inputs when `not_due`.
- `src/lib/frequencyUtils.ts` — add `describeEntryWindow(frequency, cycleStart,
  month)` returning the human label; no change to `isKpiLockedForPeriod`.
- `src/lib/orgKpiEmptyState.ts` — new `all-not-yet-due` empty kind.
- Anchor repair and scope-row sync run through the existing
  `ensure_org_kpi_scope_rows` RPC and a one-shot audited update.
- Tests: `frequencyUtils` window labels, `orgKpiEmptyState` new kind, and a
  July-2026 fixture asserting 22 not-due and 166 open definitions.
- Docs: ADR-310, POLICY §ORG-KPI-ENTRY-WINDOW-VISIBILITY, DOCUMENTATION.md
  version entry.
