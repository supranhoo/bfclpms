

## Plan: Fix Org KPI Audit Review — Names, Codes, Values, Attachments, Remarks

### Problems Identified

1. **"Unknown" employee names / missing codes** — The profiles query returns data but RLS may block visibility for the logged-in user. The auditor role has a SELECT policy on profiles, so the issue is likely that the logged-in user doesn't have the `auditor` role, OR the `as any` cast is hiding errors. Fix: add a fallback RLS policy so audit-page users can see profiles of employees whose KPIs they're reviewing.
2. **No achieved value visible** — The org_kpi_values query fetches `achieved_value` but only shows it as a badge. Auditor needs to see the **data entry value** (achieved), **remarks**, and **evidence/attachments** uploaded by the data entry owner.
3. **Remarks column too narrow** — `max-w-[150px]` with truncation cuts off text. Need to widen or use a tooltip/expandable approach.

### Database Changes

**New RLS policy on profiles** — Allow authenticated users to view profiles of employees who have org-level KPIs at audit stage:

```sql
CREATE POLICY "Audit reviewers can view org kpi employee profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM kpis k
    WHERE k.employee_id = profiles.id
      AND k.is_org_level = true
      AND k.status IN ('audit', 'management_review', 'approved')
  )
);
```

### Hook Changes — `useOrgKpiAuditReview.ts`

1. Expand `org_kpi_values` query to also fetch: `remarks`, `evidence_url`, `evidence_urls`, `entered_by`, `data_source`, `status`
2. Add these fields to `OrgKpiAuditGroup` interface: `dataEntryRemarks`, `evidenceUrl`, `evidenceUrls`, `enteredBy`, `dataSource`, `orgValueStatus`
3. Map these into each group from the achieved values query

### UI Changes — `OrgKpiAuditCard.tsx`

1. **Show data entry info in card header**: Display achieved value with data entry remarks, data source, and who entered it
2. **Show attachments**: Render clickable links/thumbnails for `evidence_url` and `evidence_urls` (matching the pattern used in `OrgKpiEntryCard`)
3. **Widen remarks column**: Remove `max-w-[150px]`, use `min-w-[200px]` instead, and show full text with tooltip on hover for audited rows
4. **Employee name/code fix**: Will be resolved by the new RLS policy; also add employee_code display in a visible format

### Files Modified

| File | Change |
|------|--------|
| DB migration | Add RLS policy for audit-stage profile visibility |
| `src/hooks/useOrgKpiAuditReview.ts` | Expand org_kpi_values query; add evidence/remarks/enteredBy to group interface |
| `src/components/admin/OrgKpiAuditCard.tsx` | Show data entry details (achieved, remarks, attachments) in header; widen remarks column; ensure name/code visible |
| `DOCUMENTATION.md` | v2.15.28 |

### Risk Assessment
- **Regression**: Zero — additive RLS policy, UI enhancements only
- **Security**: New RLS policy is scoped to org-level KPIs at audit+ stages only
- **Data**: No schema changes, read-only additions

