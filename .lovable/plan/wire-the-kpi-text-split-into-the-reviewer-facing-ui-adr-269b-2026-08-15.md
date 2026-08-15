# Wire the KPI text split into the reviewer-facing UI (ADR-269b)

Phase 3 of ADR-269. The four structured columns are populated in the database but
nothing outside the admin screen reads them. This plan makes the split visible
wherever reviewers actually read a KPI, with zero change to legacy KPIs.

## Assumptions

- Only display changes. No scoring, weightage, workflow, status or `kpi_name`
  writes are touched.
- Legacy KPIs (fiscal start year < 2026, or any row with no `kpi_title`) must
  render byte-for-byte as they do today, through the existing parser.
- `resolveKpiText()` in `src/lib/kpiTextSplit.ts` is the only decision point for
  "structured or legacy" — no component re-implements it.

## What changes visually

| Surface | Today | After |
| --- | --- | --- |
| Scorecard table row (`KpiDetailsTable`) | First chunk of the blob up to "Formula" | Clean **Title** on one line; a small "Details" affordance opens the parts |
| Mobile / tablet KPI cards | Same truncated blob | Title only, two-line clamp |
| Review panel header (`KpiHeaderSection`, `ReviewDetailsCard`, `ReviewDetailsCardCompact`) | Whole blob with bolded markers | Title as heading, then labelled **Description / Formula / Scoring Logic** blocks; Formula and Scoring collapsed by default on mobile, expanded on desktop |
| KPI detail modal (`KpiLogicModal`) | One `whitespace-pre-wrap` paragraph | Same three labelled sections, each individually copyable text |

Interaction impact: nothing becomes click-only that is readable today on desktop.
Responsiveness: labelled blocks stack on `<sm`; Formula/Scoring collapse behind a
"Show formula & scoring" toggle under `md`.

## Implementation

1. **Fetch the columns.** Add `kpi_title, kpi_description, kpi_formula,
   kpi_scoring_logic` to `SLIM_KPI_SELECT` in `src/hooks/useKpis.ts` and to the
   explicit KPI selects that feed the touched surfaces
   (`src/pages/reports/KpiScorecardDetail.tsx`). Reports and other selects are
   untouched in this phase, so their payload size is unchanged.
2. **One presentational component**, `src/components/kpi/KpiText.tsx`:
   - `<KpiTitle kpi={...} />` — resolved title, falls back to
     `getKpiSummaryText(kpi_name)` when unstructured.
   - `<KpiTextBlocks kpi={...} collapsible />` — labelled Description / Formula /
     Scoring sections when structured; renders today's
     `renderBoldKpiText(kpi_name)` verbatim when not.
   Both call `resolveKpiText()` and nothing else. No component imports
   `splitKpiText` directly.
3. **Swap call sites** to those two components:
   `KpiDetailsTable.tsx`, `review/MobileKpiCard.tsx`,
   `dashboard/MobileKpiCard.tsx`, `tablet/TabletKpiRowCard.tsx`,
   `KpiHeaderSection.tsx`, `ReviewDetailsCard.tsx`,
   `ReviewDetailsCardCompact.tsx`, `KpiLogicModal.tsx`.
4. **Precedence guard.** `KpiHeaderSection` already prefers a canonical registry
   name over `kpi_name`. Order stays: canonical registry name > structured title >
   legacy first line — locked by a test so the standardization registry keeps
   winning.
5. **Structured badge (admin/HR only).** A muted "Structured" chip next to the
   title in the review panel, so admins can see rollout coverage without a
   separate report. Hidden for regular employees.

## Risk & impact

- **Data:** read-only. No migration, no writes.
- **Workflow / permissions:** unchanged; no query or RLS surface is added.
- **Regression risk:** medium-low, concentrated in shared components. Mitigated by
  the resolver fallback (any row without `kpi_title` takes today's exact path) and
  by snapshot-style tests on both branches.
- **Scalability:** four extra text columns per KPI row on the scorecard queries.
  Pagination and batching are unchanged; no new round trips.
- **Rollback:** revert the touched components — the columns can stay populated.

## Tests

- `resolveKpiText` legacy branch renders identically to `getKpiSummaryText` /
  `renderBoldKpiText` for a fixture of real legacy KPI texts.
- Structured branch renders Title / Description / Formula / Scoring as separate
  nodes and never prints the raw `kpi_name`.
- Canonical-registry-name precedence over structured title.
- Partial structure (title only, no formula) renders the title and omits empty
  sections rather than showing "—".

## Docs

ADR-269b appended to `DOCUMENTATION.md`, and
`POLICY §KPI-TEXT-SPLIT-FORWARD-ONLY` gains the display contract: one resolver,
canonical name wins, legacy rows unchanged.

## Out of scope for this phase

Structured authoring fields in the KPI/template editor, report and export columns,
notification text, and the low-confidence admin correction queue.
