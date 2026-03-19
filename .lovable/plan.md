

## RCA: Attachment Not Shown in KPI Detail View for Org KPIs

### Root Cause

Evidence files uploaded on the Org KPI Data Entry page are stored in `org_kpi_values.evidence_url`. When the "Save & Propagate" action runs, it calls the `propagate_org_kpi_value` RPC function, which upserts into `review_submissions` — but **only copies these fields**:

- `achieved_value`
- `self_score` / `self_rating`
- `self_remarks`
- `is_na` / `na_marked_by_role`

**`self_evidence_url` and `self_evidence_urls` are never written.** So the Review Journey card in the KPI detail view (which reads from `review_submissions`) always shows no attachments.

### Data Flow (Current — Broken)

```text
Org KPI Data Entry
  └─ saves evidence_url → org_kpi_values ✅
  └─ calls propagate_org_kpi_value RPC
       └─ upserts review_submissions
            └─ self_evidence_url = ❌ NOT SET
            └─ self_evidence_urls = ❌ NOT SET

KPI Detail Panel (ReviewStageCard)
  └─ reads submission.self_evidence_urls → [] (empty)
  └─ reads submission.self_evidence_url → null
  └─ Result: No attachment shown ❌
```

### Fix

Two changes needed:

**1. Update `propagate_org_kpi_value` RPC** to accept and write evidence URL

Add a `p_evidence_url` parameter and include `self_evidence_url` + `self_evidence_urls` in the upsert:

```sql
-- Add evidence_url to the per-item jsonb payload
self_evidence_url = (item->>'evidence_url'),
self_evidence_urls = CASE 
  WHEN item->>'evidence_url' IS NOT NULL 
  THEN jsonb_build_array(item->>'evidence_url')
  ELSE '[]'::jsonb 
END
```

**2. Update `usePropagateOrgKpiValue.ts`** to pass evidence_url through the ratings payload

The `buildRatingsPayload` function and `callPropagationRpc` need to include `evidence_url` from the org_kpi_values record in each item of the `kpiRatings` array sent to the RPC.

**3. Update `OrgKpiDataEntry.tsx` propagation call** to pass evidence_url to the hook

### Files to Change

| File | Change |
|------|--------|
| **New migration** | Update `propagate_org_kpi_value` RPC to handle `evidence_url` in per-item JSONB |
| **`src/hooks/usePropagateOrgKpiValue.ts`** | Pass `evidence_url` through `kpiRatings` array items; accept it in propagation params |
| **`src/pages/admin/OrgKpiDataEntry.tsx`** | Pass `evidenceUrl` to the propagation hook call |

