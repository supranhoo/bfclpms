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
