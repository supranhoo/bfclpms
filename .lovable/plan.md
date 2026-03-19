

## Fix: KPI Journey Report Stuck — URL Length Limit Exceeded

### Root Cause
The network logs show a **400 Bad Request** on the `kpi_audit_logs` query. The `.in()` filter contains ~1000 UUIDs, generating a URL that exceeds the PostgREST URL length limit (~5,000 characters). Per project conventions, the max batch size must be **300 UUIDs**.

The same issue affects `review_submissions` which also uses a batch size of 1000.

### Fix

**File: `src/hooks/useKpiJourneyReport.ts`**

Reduce batch size from 1000 to 300 in three places:

1. **Line 98** — `submissionsPromise` loop: change `i += 1000` and `.slice(i, i + 1000)` to 300
2. **Line 112** — `logsPromise` `batchSize` constant: change from `1000` to `300`

That's it — two constant changes, same file.

### Files Changed
| File | Change |
|------|--------|
| `src/hooks/useKpiJourneyReport.ts` | Reduce `.in()` batch size from 1000 to 300 for submissions and audit logs |

