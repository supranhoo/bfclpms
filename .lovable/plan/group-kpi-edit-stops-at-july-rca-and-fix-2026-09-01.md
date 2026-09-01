# Group KPI edit stops at July: RCA and fix

## What actually happened (verified in the data)

The KPI in the screenshot is *Achieve 1050 TPD Power Generation target* (KRA "Achieve organization's
production target"), edited today at 15:00 UTC with the new "≥ 15% Incentive" scoring ladder.

The audit run log for that edit shows the span it wrote to:

```text
July 2026      affected 1   <- the only row that changed
September 2026 affected 0
October 2026   affected 0
November 2026 … June 2027   affected 0
```

August 2026 was **never in the list at all** — the span jumped July → September. And the months that
were in the list matched zero rows even though the rows exist.

Two independent defects, both confirmed:

**1. The forward span silently drops the months between the anchor and today.**
`resolveEditSpan` (`src/components/admin/bu-console/groupEditSpan.ts`, line 67) keeps the anchor month
and then removes every implicit month that is before the current calendar month. Today is 1 Sep, the
anchor was July, so August was filtered out as "past". Exactly the reported symptom: July changed,
August did not.

**2. Future-month rows do not match the group, because they have no title.**
The July and August rows carry `kpi_title = 'Achieve 1050 TPD Power Generation  target'`; the
September and October rows carry `kpi_title = NULL` (and null description/formula/scoring logic).
`bu_console_group_edit_definition` matches rows by `title_key`, falling back to the raw legacy
`kpi_name` when `kpi_title` is empty — and that legacy name is the long "Achieve Power generation
target from WHRB 1050 TPD .: - Formula: …" blob, which never normalises to the title key. So every
future month reported `affected 0`.

The untitled September/October rows were created on 29 Aug by the rollover, which copied the row but
not its structured title/description/formula/scoring fields — that is the upstream reason those
months are unmatchable.

**3. The preview did not warn.** Eleven months reported zero matched rows and the confirm dialog still
read as a success, so the admin had no signal that only one month was written.

## 5-Why

1. Why is August unchanged? It was not in the write span.
2. Why not? The span filter treats any month earlier than today as "past" and strips it, even when it
   sits inside the anchor→future range the admin chose.
3. Why did September+ also not change? Their rows failed the group's title match.
4. Why? Those rows have `kpi_title = NULL`, so matching fell back to the legacy long `kpi_name`.
5. Why is the title missing? The rollover that created them did not carry the structured definition
   fields forward.

## The fix

### A. Span: never skip a month inside the chosen range
- `resolveEditSpan` filters against the **anchor**, not against today: months before the anchor are
  still excluded, months between the anchor and today are kept.
- The preview labels those in-between months as "back-dated" so the admin sees explicitly that
  August will be rewritten, and can drop it.
- `spanSkipsPastMonths` becomes the flag that renders that notice rather than a silent skip.

### B. Matching: identify the group by definition, not only by title text
- `bu_console_group_edit_definition` gains an optional `p_definition_ids uuid[]`. A row matches when
  the title key matches **or** its `kpi_definition_id` is one of the anchor group's definition ids.
  The console passes the ids it already holds for the open KPI node.
- Same predicate added to the dry-run path, so preview and commit stay identical.

### C. Preview honesty
- The per-month preview table shows matched / will-write / will-skip per month, and any month with
  zero matches is flagged amber with "no rows matched in this month".
- The confirm button stays enabled, but the result toast reports months written vs months with no
  match instead of a flat success.

### D. Rollover carries the definition forward
- The rollover copy includes `kpi_title`, `kpi_description`, `kpi_formula`, `kpi_scoring_logic` and
  `qualitative_options` from the source row, so newly created future months are matchable from day one.

### E. Repair the rows already broken
- One-off backfill: for rows with `kpi_title IS NULL` that share a `kpi_definition_id` with a titled
  row in the same fiscal cycle, copy the title and the structured definition fields from the most
  recent titled sibling. Additive, logged to a dated repair archive, reversible.
- Then this specific KPI is corrected by re-running the group edit from July with "this and all
  future months" — it will pick up August, September and October and be fully audited, rather than
  being patched by hand.

## Risk and impact

- **Data:** B and C are read-path only. A changes which months a *future* edit writes — the admin
  still confirms an explicit month list. E writes only to rows that currently hold NULLs, never
  overwriting an existing value; archived for rollback.
- **Workflow:** none. Locked/approved rows keep being skipped by the existing lock rules.
- **UI:** the group edit dialog's span preview gains a back-dated badge and a per-month match count.
- **Regression risk:** medium on A — any caller of `resolveEditSpan`. The existing span unit tests are
  extended rather than replaced.
- **Scalability:** unchanged; one RPC call per month as today.
- **Rollback:** revert the two functions and the span helper; run the archived reverse of the backfill.

## Technical notes

- Edited: `groupEditSpan.ts`, its test file, `GroupDefinitionEditDialog.tsx`, `useBuConsole.ts`
  (pass definition ids), rollover copy path.
- Migration: `CREATE OR REPLACE FUNCTION bu_console_group_edit_definition` with the new optional
  parameter; plus the backfill function and its archive table with grants and RLS.
- Tests: span resolution across an anchor before today (August must be present), definition-id
  matching for untitled rows, and zero-match month reporting.
- Docs: ADR-337, `POLICY §CONSOLE-GROUP-EDIT-SPAN` amendment, DOCUMENTATION.md version history.
