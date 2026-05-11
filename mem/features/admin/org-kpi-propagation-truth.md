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

**2026-05-11 chip parity (POLICY §111.5):**
- Category-header chip aggregator (`OrgKpiDataEntry.tsx`, "X Pending / Entered / Propagated") now shares the ADR-055 `everyChildAdvanced` override with the per-row pill across **all** scopes — `organization`, `employee`, and `department`. Previously the override existed only on the org-scope branch of `deriveOrgKpiTileStatus`, so employee/department-scope KPIs whose OKV row was never back-filled showed "1 Pending" while the card and per-row counters said "Propagated · 34/34".
- Fix: in `src/lib/orgKpiStatus.ts`, the empty-`matching` early return in employee/department branches is now `everyChildAdvanced ? 'propagated' : 'pending'`.
- Regression: `src/test/orgKpiTileStatusChipParity.test.ts`.

**2026-05-11 toast-layer parity (POLICY §111.6):**
- Per-scope Propagate loop in `OrgKpiDataEntry.executeSaveAndPropagate` classifies skip reasons against a single canonical set: BENIGN = `{not_in_kra_set, reviewer_locked, no_target_rows}`, everything else is hard. `reviewer_locked` (employee already in `manager_check`/`hr_pms_review`/etc.) and the synthetic `no_target_rows` (resolver returned 0) are POLICY §88 / RLS conditions, NOT failures.
- `usePropagateOrgKpiValue` now emits a synthetic `no_target_rows` skip whenever `resolve_org_kpi_target_kpis` returns 0 rows for a per-scope call. Previously the empty result returned `{ propagatedCount: 0, details: [] }` with no `skipped`, which fed the page's `unaccounted = expected − propagated − accountedSkips` math and printed a false "may have mismatched KPI names" toast.
- Half-propagation forward-guard now compares `kpis` rows against `consideredScopeIds` (includes scopes skipped at client-side null/untouched-zero guards), not `propagatedScopeIds`. `propagatedScopeIds.push` only runs when the server confirms `propagatedCount > 0`, so the OKV `status='propagated'` UPDATE never runs for rows where no `review_submissions` row was written.
- When the unaccounted shortfall equals the count of mapped employees past `kra_set`, the page emits a neutral "Already propagated (POLICY §88)" toast instead of the destructive name-mismatch one.
- Regression: `src/test/orgKpiPropagationBenignReasons.test.ts` and the existing `src/test/orgKpiPropagationToast.test.ts`.
