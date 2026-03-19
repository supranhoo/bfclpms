

## RCA: KPI Journey Report Shows Incomplete/Incorrect Data

### Root Cause

**967 KPIs** for December 2025 were **bulk-imported** on Feb 11, 2026 with scores pre-filled (self, manager, auditor, final) and status set directly to `approved`. The import bypassed the normal workflow, so **no audit log entries** were created for stage transitions.

Evidence:
- 886 of 936 approved KPIs have **zero workflow audit logs** (no `MANAGER_FORWARDED`, `AUDITOR_FORWARDED`, `STATUS_TRANSITION`, etc.)
- Only 53 KPIs across all of December have any workflow logs at all
- All `review_submissions` have identical `submitted_at` and `updated_at` timestamps from the bulk import batch (~14:50 UTC on Feb 11)
- Abhas has only `weightage_variance_acknowledged` and 2 admin override entries — no self/manager/auditor/management action logs

The Journey report hook (`useKpiJourneyReport`) relies **entirely** on `kpi_audit_logs` to populate timeline dates (Self Submitted, Manager Action, Auditor, etc.). Since no logs exist for bulk-imported KPIs, all timeline columns show "—".

### Fix (CAPA)

**Use `review_submissions` as a fallback** when audit logs are missing. For bulk-imported KPIs, we can infer stage completion from the presence of non-null scores in `review_submissions`:

- `self_score` is not null → Self stage completed at `submitted_at`
- `manager_score` is not null → Manager stage completed at `submitted_at`
- `auditor_score` is not null → Auditor stage completed at `submitted_at`
- `management_score` is not null → Management stage completed at `submitted_at`
- `skip_level_score` / `hr_pms_score` → same pattern
- KPI status = `approved` → Final approved at `submitted_at`

### Technical Changes

**File: `src/hooks/useKpiJourneyReport.ts`**

1. **Fetch `review_submissions`** alongside audit logs — batch-query by KPI IDs, selecting `kpi_id, submitted_at, self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score`.

2. **Build a submissions map**: `kpiId → submission record`.

3. **After building the audit-log timeline**, fill in missing fields from `review_submissions`:
   - If `selfSubmittedAt` is null but `self_score` is not null → use `submitted_at`
   - If `managerActionAt` is null but `manager_score` is not null → use `submitted_at`
   - Same for skip_level, hr_pms, auditor, management
   - If `finalApprovedAt` is null but KPI status is `approved` and `final_score` is not null → use `submitted_at`

4. For `kraAssignedAt`, continue using `kpi.created_at` as the fallback (already working).

This approach:
- Preserves precise timestamps from audit logs when they exist (organic workflow)
- Falls back to `submitted_at` from review_submissions for bulk-imported KPIs
- Correctly populates all timeline columns so Abhas, Ankit, and other bulk-imported users show complete journey data
- No database migration needed — read-only change to the hook

### Single file change
`src/hooks/useKpiJourneyReport.ts` — ~30 lines added for the submissions fetch and fallback logic.

