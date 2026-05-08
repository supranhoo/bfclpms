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
