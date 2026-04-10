

## RCA + CAPA: N/A Confirmation Remarks Not Shown in Review Journey Tiles

### 1. Root Cause

When a reviewer (Manager, Auditor, Management, or any unified level) confirms a KPI as N/A and enters remarks, the remarks are **only saved to `kpi_audit_logs`** as `new_value.na_remarks`. They are **never written** to the `review_submissions` table's corresponding `*_remarks` column (e.g., `manager_remarks`, `auditor_remarks`, `management_remarks`).

The Review Journey tiles (`ReviewStageCard`) read remarks exclusively from `submission.*_remarks` fields. Since those fields remain NULL after N/A confirmation, the tiles display "No remarks".

**Affected files (4 scorecards with the same bug):**
- `UnifiedScorecard.tsx` — lines ~1084-1092
- `EmployeeScorecard.tsx` — lines ~476-484
- `AuditScorecard.tsx` — lines ~471-472
- `ManagementScorecard.tsx` — lines ~628-629

### 2. Impact

- All N/A confirmation remarks entered by any reviewer are invisible in the Review Journey
- Audit trail in `kpi_audit_logs` is intact — no data loss, but the user-facing UI never surfaces these remarks
- Affects all review levels across all scorecards

### 3. Corrective Action

In each of the 4 scorecard files, after the `kpi_audit_logs` insert for N/A confirmation, add a `review_submissions` update to persist `naRemarks` into the reviewer's `*_remarks` column:

| File | Change |
|------|--------|
| `UnifiedScorecard.tsx` | After audit log insert (~line 1092), add `supabase.from('review_submissions').update({ [remarksField]: naRemarks }).eq('kpi_id', selectedKpi.id)` where `remarksField` maps from `viewLevel` (e.g., `manager` → `manager_remarks`) |
| `EmployeeScorecard.tsx` | Same pattern — save `naRemarks` to `manager_remarks` column |
| `AuditScorecard.tsx` | Same pattern — save `naRemarks` to `auditor_remarks` column |
| `ManagementScorecard.tsx` | Same pattern — save `naRemarks` to `management_remarks` column |
| `DOCUMENTATION.md` | Log RCA v2.33.2 — N/A remarks not persisted to review_submissions |
| `POLICY.md` | Sync version |

**Mapping logic (for UnifiedScorecard which handles multiple levels):**
```typescript
const remarksFieldMap: Record<string, string> = {
  manager: 'manager_remarks',
  skip_level: 'skip_level_remarks',
  hr_pms: 'hr_pms_remarks',
  auditor: 'auditor_remarks',
  management: 'management_remarks',
};
const remarksField = remarksFieldMap[viewLevel];
if (remarksField && naRemarks.trim()) {
  await supabase.from('review_submissions')
    .update({ [remarksField]: naRemarks })
    .eq('kpi_id', selectedKpi.id);
}
```

### 4. Preventive Action

- Any flow that writes to `kpi_audit_logs` with user-entered text must also persist that text to the corresponding `review_submissions` column so it is visible in the Review Journey
- Add to the Scorecard Checklist: "Verify all user-entered remarks are written to both audit logs AND review_submissions"

### 5. Risk Assessment

- **Data impact**: Additive only — writes remarks to a previously-NULL column
- **Regression risk**: Zero — existing non-N/A flows are untouched
- **Security**: No change — same RLS policies govern `review_submissions` updates

