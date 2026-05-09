---
name: Org KPI Propagation Truth
description: Per-row "Propagated" badge derives from review_submissions presence, not org_kpi_values.status; RPC mapper handles both result shapes.
type: feature
---

**Rule:** "Propagated" for an Org KPI row means a `review_submissions` row exists with a value or `is_na`, NOT `org_kpi_values.status = 'propagated'`. OKV.status is set by a separate post-RPC UPDATE and historical propagations frequently skipped it.

**Implementation:**
- `OrgKpiDataEntry.buildCardData` (employee + department branches) sets `status` from the `useOrgKpiSubmissionFallback` map presence; `OKV.status === 'approved'` is the only OKV override.
- `callPropagationRpc` in `src/hooks/usePropagateOrgKpiValue.ts` MUST read both RPC result shapes:
  - Live: `{ propagated, skipped (number|array), results, skipped_details }`
  - Legacy: `{ propagated_count, skipped_count, details, skipped }`
  Reading only the legacy keys produces `propagatedCount = undefined` and silently breaks the per-batch summary toast and half-propagation guard.

**Regression:** `src/test/orgKpiPropagateResultContract.test.ts` (RPC contract), `src/test/orgKpiRowStatusPill.test.tsx` (mixed-status badge), POLICY §111, DOCUMENTATION v2.66.7.50.

**2026-05-08 follow-up (POLICY §111.1, §111.2):**
- Summary badges ("X propagated / Y not propagated") in `OrgKpiScopedEntryTable` MUST stay visible for one-sided distributions; only suppress when every row is `pending`.
- All RLS paths (`kpis`, `org_kpi_values`, `review_submissions`) MUST match `org_kpi_data_owners.kra_name`/`kpi_name` via `public.normalize_kpi_text(...)`. Raw equality previously hid propagated submission rows from data owners, surfacing as "all Not propagated".

**2026-05-08 final fix (POLICY §111.3):**
- Authoritative "Propagated" truth now comes from the snapshot RPC field `propagatedEmpIdsByKey` (set of employee ids per def_key with a `review_submissions` value/is_na). `useOrgKpiSubmissionFallback` is a secondary signal only.
- `buildCardData` employee branch: `propagated` if `propagatedEmpsByKey.get(defKey).has(empId)` OR fallback map has entry; OKV `approved` overrides. Department branch aggregates the same set across mapped employees in that department.
- Snapshot mismatch with browser-side joins (RLS/normalization/coverage drift) was the root cause of "0 propagated / 50 not propagated" after a successful Propagate.
- Regression test: `src/test/orgKpiPropagatedSnapshotTruth.test.ts`.

**2026-05-08 cross-department fix (ADR-062 / POLICY §111.4):**
- Org KPI propagation MUST resolve target KPIs server-side via `resolve_org_kpi_target_kpis` (SECURITY DEFINER). Never use a client `supabase.from('kpis').select(...)` to gate the propagate write — RLS hides employees in departments the data owner cannot see, leaving 10/50-style permanent "Not propagated" rows.
- The resolver authorises via `has_role('admin')` OR a matching `org_kpi_data_owners` row (normalized kra/kpi). It then drives the existing `propagate_org_kpi_value` RPC unchanged.
- `usePropagateOrgKpiValue.fetchTargetKpis` is now a thin wrapper around the RPC; old ilike fallback chain was deleted.

**2026-05-09 ADR-055 parity per row (POLICY §111.3 update):**
- Per-row "Propagated" pill in the Org KPI scoped table now goes through `deriveScopedRowStatus()` (`src/lib/orgKpiStatus.ts`), which promotes `isPastKraSet` (i.e. `kpis.status !== 'kra_set'`, the same fact the card-level pill uses via ADR-055) to a first-class signal. This eliminates the three-surface drift where the card said "Manager Check / propagated", the row said "Not propagated", and the scorecard correctly showed Manager Check.
- Precedence: `okvStatus === 'approved'` → approved; `isPastKraSet || isInPropagatedSet || hasSubmissionFallback` → propagated; `okvHasValue` → entered; else pending.
- `kraSetEmpIdsByKey` (already returned by the snapshot RPC) is the data source — no new RPC.
- Regression: `src/test/orgKpiScopedRowStatus.test.ts`. Display-only fix; no DB writes, no propagation contract change.
