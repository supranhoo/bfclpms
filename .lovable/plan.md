

## Report — Org KPI Gap Status: NOT Cleared

### Current State (April 22, 2026)

| Period | KPI rows (employee-assigned Org KPIs) | OKV rows (anchors) | Distinct OKV signatures (visible cards) | Missing OKV signatures |
|---|---|---|---|---|
| **March 2026** | 752 (Mon 690 + BiM 32 + Daily 4 + Qtr 3) | 814 | **154** | (baseline) |
| **April 2026** | 752 (Mon 712 + BiM 33 + Daily 4 + Qtr 3) | **64** | **14** ⚠️ | **166** |

The earlier 158 vs 147 gap is now far worse: April has only **14 visible OKV cards** vs March's 154. **166 Org KPI signatures are missing OKV anchors for April**, breaking the data-entry page.

### Breakdown of Missing April Anchors

| Frequency | Status | Missing OKV Anchors |
|---|---|---|
| Monthly | kra_set | 144 |
| Monthly | self_review | 1 |
| Bi-Monthly | kra_set | 15 |
| Daily | kra_set | 4 |
| Quarterly | kra_set | 2 |
| **Total** | | **166** |

### Root Cause

The previously approved "Repair Frequency Cycle Anchors" tool (v2.66.7.2 plan) was approved in plan-only form, but the runtime gap remains. The April OKV batch was never fully created — only 14 signatures (mostly the bi-monthly anchor sweep) currently exist in `org_kpi_values` for April 2026, while 166 employee-assigned Org KPIs reference signatures that have no OKV row.

### Recommended Fix — Backfill April OKV Anchors

Run a one-shot repair via the existing **Data Repair → Reconcile Org KPI Inheritance** RPC (`reconcile_org_kpi_inheritance`) plus a focused April OKV-anchor seed:

1. **Migration** `<ts>_backfill_april_2026_okv_anchors.sql`
   - For each `(category_id, kra_name, kpi_name)` that exists in `kpis` for April 2026 with `is_org_level = true` and has no OKV row in April 2026, insert a fresh OKV anchor row with `status = 'pending'`, `achieved_value = NULL`, copying `frequency`, `target_value`, `unit`, `kpi_type`, `weightage`, etc. from the canonical March OKV row of the same signature (or from the kpis row if no March anchor exists).
   - Set `created_by = NULL` (system attribution per `system-performer-attribution`).
   - Wrap in audit-log entry `BULK_OKV_ANCHOR_BACKFILL` with payload `{period: 'April', year: 2026, anchored: 166}`.
   - Idempotent guard: `WHERE NOT EXISTS (SELECT 1 FROM org_kpi_values …)`.

2. **Validation Queries (post-run)** — must show:
   - April OKV distinct signatures ≥ 166+14 = ≈170 (matching March's 154 plus April-new ones).
   - Zero rows from the "missing OKV" diagnostic above.

3. **DOCUMENTATION.md v2.66.7.6** + **POLICY.md §92**: *"Period rollover MUST seed an OKV anchor row for every distinct Org KPI signature on or before the period's first business day."*

4. **mem://features/admin/data-repair-engine** — add note about April 2026 backfill and the new `BULK_OKV_ANCHOR_BACKFILL` audit action.

### Risk & Impact Report

- **Data Impact**: Adds exactly 166 OKV anchor rows for April 2026; no existing rows altered.
- **Workflow Impact**: Restores the April data-entry page from 14 cards to ≈170 cards. Owners can resume entering values.
- **UI/UX**: Fixes the visible discrepancy reported (158 → 147 → now 14).
- **Regression Risk**: Very low — `WHERE NOT EXISTS` guard prevents duplicates; status starts as `pending` so no premature propagation.
- **Mitigation**: Wrapped in transaction; audit row provides rollback target.

### Out of Scope

- Re-running the auto-rollover engine (defer to v2.66.7.2 plan separately).
- Backfilling May/June (May has only 3 Quarterly signatures today; defer until April is clean).

### Deliverables

- One migration backfilling 166 April OKV anchors with audit trail.
- Post-run validation snapshot proving the gap is closed.
- DOCUMENTATION.md v2.66.7.6, POLICY.md §92, memory update.

