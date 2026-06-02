# Phase 5 — Extend Report Field Sequence to Remaining Reports

Phase 4 shipped the registry, resolver, shortlink route, and Report Builder DnD UI, with **Performance Report** as the reference wiring. Phase 5 rolls the resolver out to the rest of the reports without changing the resolver contract.

## 1. Assumptions
- Phase 4 contract is frozen: `useResolvedReportFields(reportId, defaults)` is the only consumer API. Flag `report_overrides_enabled` stays the master switch.
- Each report keeps its own hardcoded `DEFAULT_FIELDS` (key, label, sort, required?). The catalog seed mirrors those defaults.
- "Wiring" means: (a) seed fields in `src/lib/reports/catalog.ts`, (b) read `useResolvedReportFields` for header order + label, (c) reuse same list in CSV/XLSX export.

## 2. Risk & Impact
| Area | Impact | Mitigation |
|---|---|---|
| Reports UI | Header order/labels driven by resolver | Flag-off fallback to defaults, identical behaviour today |
| Exports | Same resolver drives export headers | Snapshot test per report |
| Data | Catalog additions only — re-running seed is idempotent | Seeder uses `ON CONFLICT DO UPDATE` on registry, leaves overrides untouched |
| Regression | Pages that read row data by index would break | All target pages already read by object key (verified Phase 4) |
| Scope | 19 remaining reports — risk of bloat | Group by complexity: Tier A (simple table reports) first, Tier B (composite/tabbed) later |

## 3. Rollout Tiers

**Tier A — single flat table, low risk (this phase)**
- `RPT-KRA-001` KRA Issuance
- `RPT-TNI-001` Training Needs
- `RPT-EPS-001` Employee Performance Summary
- `RPT-CMP-001` Completion Rate
- `RPT-DEP-001` Department Summary
- `RPT-AUD-001` Audit Trail
- `RPT-VAR-001` Variance
- `RPT-QRY-001` Query Report
- `RPT-ISS-001` Issues
- `RPT-KPID-001` KPI Detail
- `RPT-KST-001` KPI Status Tracker
- `RPT-BNK-001` Bottleneck

**Tier B — composite / tabbed / matrix (deferred to Phase 6)**
- `RPT-INC-001` Incentive (901-line `MonthlyIncentiveTable` + retroactive sub-report — needs its own field discovery pass)
- `RPT-MAT-001` KPI-Employee Matrix (pivoted columns)
- `RPT-MSR-001` Monthly Scorecard (multi-section)
- `RPT-KJN-001` KPI Journey (timeline view, not tabular)
- `RPT-KSD-001` KPI Scorecard Detail
- `RPT-MTK-001`, `RPT-TVM-001` (manager-vs-team comparison views)

## 4. Step-by-Step (Tier A)

For each Tier A report:
1. Open the page, extract the existing column list into `<REPORT>_DEFAULT_FIELDS` const (key/label/sort, mark identity columns `is_required: true`).
2. Add the field array to its `REPORT_CATALOG` entry in `src/lib/reports/catalog.ts`.
3. Replace header render with `useResolvedReportFields('RPT-XXX-001', DEFAULT_FIELDS)`; map cells by `field.key`.
4. Update its export builder to use the same resolved list.
5. Add a snapshot test: with override `{ field_key: X, custom_sort: 0, custom_label: 'Y' }`, header order matches.

Then in the Report Builder tab:
6. Re-run **Seed** to upsert new field rows for all Tier A reports.

## 5. UI Changes
- No new screens. Tier A reports now respect admin re-ordering / renaming / hide via the existing Report Builder tile.
- Admins see the same reports as in Phase 4 but expanding each Tier A row now shows its real columns instead of an empty list.

## 6. Tests
- One header-order snapshot per Tier A report (12 tests).
- `catalog.test.ts`: every Tier A report has ≥1 required field and unique `field_key`s.
- Idempotency: seeder run twice produces no-op (already covered, re-asserted).

## 7. Out of Scope
- Tier B reports (Phase 6).
- New computed columns from the UI.
- Per-user column preferences.

## 8. Rollback
- Toggle flag off → every report instantly renders its hardcoded defaults.
- Per-report Reset in the Report Builder clears overrides.
- Catalog additions are additive; removing them later just falls back to page defaults.

---

## Phase 5 — Progress Log

**Shipped (Phase 5a):**
- Field catalog seeded for 4 Tier A reports: KRA Issuance, Department Summary, Variance, Unified Issues (Performance already wired in Phase 4).
- XLSX export of all 4 now drives header order + labels through `useResolvedReportFields`. Cell access is by field key, not index.
- `src/lib/reports/catalog.test.ts` guards required-field presence and field_key uniqueness.
- Admins must click **Seed** in System Settings → Report Builder to push the new field rows into `report_field_registry`. Flag stays off by default → zero behaviour change.

**Remaining Tier A (Phase 5b):** TNI, Employee Performance Summary, Completion, Audit Trail, Query, KPI Detail, KPI Status Tracker, Bottleneck. Same pattern — catalog seed + export switch.

**Tier B (Phase 6):** Incentive, KPI-Employee Matrix, Monthly Scorecard, KPI Journey, KPI Scorecard Detail, Manager-vs-Team views. These need bespoke field-discovery passes; not flat tables.
