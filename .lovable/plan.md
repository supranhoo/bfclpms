

# Audit: Send-Back Improvements — Gaps Found

## What's working

| Level | Data preserved on send-back to employee | kpi_queries record created | SentBackBanner shown |
|---|---|---|---|
| **Manager (UnifiedScorecard)** | ✅ Self fields kept | ✅ Yes | ❌ Not shown to manager |
| **Auditor (UnifiedScorecard)** | ✅ Self fields kept | ✅ Yes | ❌ Not shown to auditor |
| **Skip-level (UnifiedScorecard)** | ✅ Self fields kept | ✅ Yes | ❌ Not shown |
| **HR PMS (UnifiedScorecard)** | ✅ Self fields kept | ✅ Yes | ❌ Not shown |
| **Management (ManagementScorecard)** | ⚠️ Uses own send-back logic | ❌ No `kpi_queries` record | ❌ Not shown |
| **Manager (useSendBackKpi)** | ✅ Self fields kept | ✅ Yes | N/A (employee sees it) |
| **Employee (SelfReviewSheet)** | N/A | N/A | ✅ Yes |

## Issues to fix

### 1. ManagementScorecard doesn't create `kpi_queries` record
`ManagementScorecard.tsx` line ~429 only creates an `kpi_audit_logs` entry but NOT a `kpi_queries` record with `query_type: 'send_back'`. This means if management sends back a KPI, the `SentBackBanner` will have nothing to display.

**Fix**: Add the same `kpi_queries.insert(...)` block that `UnifiedScorecard` already has (lines 722-734).

### 2. `useSendBackKpi` still sets `kpi_status: 'open'`
Line 976 of `useKpis.ts` still includes `kpi_status: 'open'`. The plan said to remove it but it wasn't removed. This is actually harmless since `kpi_status` is a submission-level field (not the KPI status itself), and setting it to `'open'` is the correct behavior to signal the employee should re-submit. **No change needed** — this is correct as-is.

### 3. SentBackBanner not shown to reviewers
When a reviewer (manager/auditor/management) opens a KPI that was previously sent back by a higher-level reviewer, they don't see the send-back reason. The plan called for showing this in UnifiedScorecard and ManagementScorecard.

**Fix**: In both `UnifiedScorecard.tsx` and `ManagementScorecard.tsx`, add the `SentBackBanner` inside the review sheet/dialog when the KPI has a recent send-back query.

## Files to modify

| File | Change |
|---|---|
| `ManagementScorecard.tsx` | Add `kpi_queries` insert on send-back (parity with UnifiedScorecard) |
| `UnifiedScorecard.tsx` | Show `SentBackBanner` in review sheet for sent-back KPIs |
| `ManagementScorecard.tsx` | Show `SentBackBanner` in review sheet for sent-back KPIs |

