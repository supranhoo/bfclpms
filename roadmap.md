# Roadmap

- [x] Harden scheduled rollover invocation classification and fail-closed guards
- [x] Add production-parity rollover tests and mock scenarios
- [x] Add/apply reversible September incident repair and verify data restoration
- [x] Deploy and verify the corrected rollover function
- [x] Synchronize ADR, POLICY.md, and DOCUMENTATION.md

## ADR-341 — Target is value-based only (done)
- [x] Shared `typeOwnsTarget` predicate + group/row/drawer editor guards
- [x] Suppress Target on review/report surfaces (scorecard + KRA export)
- [x] Server invariant: `enforce_target_is_value_based` trigger on `public.kpis`
- [x] Audited forward-only residue cleanup (219 rows) + tests + docs

## ADR-342 — Org KPI propagation failure (ambiguous RPC overload) (done)
- [x] RCA + 5 Whys for `resolve_org_kpi_target_kpis` overload ambiguity
- [x] Dropped the stale 8-arg overload, regression test, POLICY + DOCUMENTATION

## ADR-344 — Org KPI scope-change skip transparency & seeding (in progress)
- [x] 11-arg `change_org_kpi_scope_cascading` overload with `p_seed_missing`
- [x] Reason-aware skip grouping helper + unit tests
- [x] Hook + dialog wiring: truthful skip labels, opt-in "create in remaining months"
- [ ] POLICY + DOCUMENTATION sync

## ADR-345 — KPI range rename blocked by stale audit vocabulary (done)
- [x] RCA/5-Why: `correct_kpis_range` logs `rename_kpis_range`, CHECK allowlist lacked it
- [x] Allowlist extended; constraint comment ties vocabulary to POLICY §AUDIT-ACTION-VOCABULARY
- [ ] Vocabulary drift guard test + POLICY/DOCUMENTATION sync

## ADR-348 — Team Reviews default "Pending action only" filter (done)
- [x] `actionableQueueFilter` predicate + unit tests
- [x] `queue` URL filter + pipeline step in EmployeeSelectorGrid (team view)
- [x] Toggle UI, X-of-Y chip, caught-up empty state, page reset, Clear All wiring
- [x] POLICY + DOCUMENTATION + ADR-348 sync
- [x] UI polish: moved toggle beside employee Active / Inactive / All filter

## Q — Structured KPI shown as plain text in View KPI Details
- [x] RCA + fix: canonical blob precedence over structured title (ADR-348b)

## ADR-349 — Org KPI Pending vs inactive employees (done)
- [x] RCA / 5-Why: snapshot RPC filtered `is_active` per aggregate, not once
- [x] RPC fix: one active population for every aggregate
- [x] Client: `activeKraSetEmpIds` intersection + explicit Pending chip count
- [x] `employee_inactive` benign skip reason (preview, toast, dialog labels)
- [x] Tests, ADR-349, POLICY §ORG-KPI-ACTIVE-POPULATION, DOCUMENTATION sync
- [ ] Follow-up: same guard inside `propagate_org_kpi_value` / `diagnose_org_kpi_propagation_gap`

## ADR-351 — Org KPI Data Entry structured KPI text (done)
- [x] RCA: console writes structured fields; card printed legacy `kpi_name`
- [x] Snapshot RPC returns kpi_title/description/formula/scoring_logic
- [x] Card renders via KpiTitle / KpiTextBlocks; keys still on kpi_name
- [x] Tests, ADR-351, POLICY §KPI-TEXT-DISPLAY-SSOT, DOCUMENTATION sync

## ADR-352 - Org KPI Data Entry rating dropdown overflow (done)
- [x] RCA: QualitativeSelect fixed-width trigger vs long tiered labels
- [x] Container-driven width, truncation + title, wrapping dropdown items
- [x] Semantic badge token instead of hardcoded white
- [x] Test src/test/qualitativeSelectLongLabel.test.tsx, ADR-352, DOCUMENTATION sync

## ADR-352a - One KPI split across several legacy names (done)
- [x] RCA: console rewrites structured text, not kpi_name; cards group on kpi_name
- [x] Consumable cost open rows normalised with reversible audit record
- [x] list_split_kpi_name_variants() detector + Normalise action on Standardization Health
- [x] Tests, ADR-352a, DOCUMENTATION sync

## ADR-353 - Accidental "Power generation from 8 MWh" edits rolled back (done)
- [x] Identified the 11 edit runs (description / category / scoring logic, Jul-Oct 2026)
- [x] Reverted all 136 items from stored before-images with conflict guard
- [x] Audit entries + runs stamped undone; verified restored values
- [x] ADR-353, DOCUMENTATION sync

## ADR-354 - One KPI split across categories, "Power generation from 8 MWh" (done)
- [x] RCA: 3 legacy kpi_name variants across 2 categories, one shared kpi_title
- [x] 18 open Jul-Oct 2026 rows renamed + recategorised with reversible audit row
- [x] list_cross_category_kpi_title_splits() + "Same KPI, Two Categories" health card
- [x] Tests, ADR-354, POLICY §88I clause 17, DOCUMENTATION sync


## ADR-355 - Reopen a submitted KRA on iPad (done)
- [x] RCA/5-Why: icon-only ghost reopen button + no mobile control + self-hiding status filter
- [x] Labelled 44px View control on all completed-state reviewer rows
- [x] statusFilter cleared on every AuditScorecard submit success + stage-naming toast
- [x] Tests, ADR-355, POLICY §REVIEW-REOPEN-AFFORDANCE, DOCUMENTATION sync


## ADR-356 - Reviewer KPI card UI assessment (done)
- [x] One status badge in header; Fwd/Done pills removed from action row
- [x] Type scale >=11px, KPI title promoted, KRA as eyebrow
- [x] Tabular Target/Weight/Score grid, `n / 5` score, unit artefacts suppressed
- [x] Semantic success/warning/info badge variants + `--info` token
- [x] >=44px touch targets and aria-labels on every control
- [x] Two-column card grid at >=768px
- [x] Tests, ADR-356, POLICY §REVIEW-CARD-PRESENTATION, DOCUMENTATION sync

## ADR-357 — Declutter reviewer KPI card list (2026-09-03)
- [x] Card grid `md:grid-cols-2` → `lg:grid-cols-2` (single column on iPad portrait)
- [x] KRA eyebrow suppressed when duplicating KPI title
- [x] Org-scope header tooltip removed; Org KPI info merged to one muted line
- [x] Scorecard toolbar wraps — no viewport overflow
- [x] Tests (21/21), ADR-357, POLICY §REVIEW-CARD-PRESENTATION addendum, DOCUMENTATION v2.66.357

## ADR-358 — KPI-Employee Matrix structured KRA/KPI text (2026-09-03)
- [x] RPC widened with kpi_title / description / formula / scoring_logic
- [x] Shared resolver helper with legacy split + raw-name fallback
- [x] Rows pivoted on category + KRA + resolved title (variant de-duplication)
- [x] Four exportable registry columns + labelled tooltip blocks
- [x] Tests (6/6), ADR-358, POLICY §KPI-TEXT-DISPLAY-SSOT addendum, DOCUMENTATION v2.66.358

## ADR-360 — Team Reviews tile/list parity (done)
- [x] `matchesTeamTile` is the single predicate for tile counts and grid membership
- [x] KRA Set tile relationship-inclusive; no `self_review` stage requirement
- [x] Queue mode skipped while a tile/status filter is active + dedicated empty state
- [x] Tests (`teamReviewTileFilter.test.ts`), ADR-360, POLICY §129b, DOCUMENTATION
