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
