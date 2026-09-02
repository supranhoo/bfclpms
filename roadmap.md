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

