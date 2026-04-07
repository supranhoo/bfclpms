

## Self-Review Recall (Withdraw & Correct) Feature

### Problem
After an employee submits their self-review (status moves from `kra_set` → `self_review`), they cannot undo or correct mistakes. The only option today is to request a formal Rollback via Admin, which is slow and cumbersome for simple correction scenarios.

### Solution
Add a **"Recall Submission"** button that allows employees to withdraw their self-review and re-enter data — gated by two conditions:
1. **Time window**: Configurable duration (e.g., 24 hours) set by Admin in System Settings
2. **Next reviewer hasn't acted**: KPI status is still `self_review` (no manager score/remarks entered yet)

```text
Employee submits self-review → status = self_review
  ├─ Within recall window + manager hasn't reviewed → "Recall" button visible
  │   └─ Click → status reverts to kra_set, employee can edit & resubmit
  └─ Window expired OR manager has acted → Recall disabled, must use formal Rollback
```

### Implementation

**1. Admin Setting: `self_review_recall_hours`**
- Add to `system_settings` via existing upsert pattern (no migration needed)
- Default: `24` hours
- Options: 1, 2, 4, 6, 12, 24, 48, 72 hours, or "Disabled"
- UI: New card in System Settings page under Controls section

**2. New Hook: `src/hooks/useRecallSubmission.ts`**
- `useCanRecallSubmission(kpiId)`: Checks eligibility:
  - KPI status === `self_review`
  - Current user is the KPI owner (`employee_id`)
  - Time since last `SELF_REVIEW_SUBMITTED` audit log entry < configured hours
  - No manager scores/remarks exist in `review_submissions` for this KPI
- `useRecallSubmission()`: Mutation that:
  - Updates KPI status back to `kra_set`
  - Clears self-review fields in `review_submissions` (achieved_value, self_rating, self_score, self_remarks, self_evidence)
  - Logs `SELF_REVIEW_RECALLED` action in `kpi_audit_logs`

**3. UI: Recall Button in SelfReviewSheet**
- Show a "Recall Submission" button (with Undo icon) on KPIs where `status === 'self_review'` and recall is eligible
- Button shows remaining time (e.g., "Recall available for 18h 32m")
- Click triggers a confirmation dialog explaining what will be cleared
- After recall, KPI returns to editable state

**4. Audit Trail**
- New action type: `SELF_REVIEW_RECALLED`
- Logged with timestamp, employee ID, KPI ID
- Visible in Audit Logs and KPI Timeline

**5. Admin System Settings UI**
- Add "Self-Review Recall Window" card in the Controls section of SystemSettings page
- Dropdown: 1h, 2h, 4h, 6h, 12h, 24h, 48h, 72h, Disabled

### Files to Change

| File | Change |
|------|--------|
| `src/hooks/useRecallSubmission.ts` | **New** — eligibility check + recall mutation |
| `src/hooks/useSystemSettings.ts` | Add `useRecallWindowHours()` convenience hook |
| `src/components/review/SelfReviewSheet.tsx` | Add Recall button with countdown + confirmation dialog |
| `src/pages/admin/SystemSettings.tsx` | Add Recall Window duration selector |
| `src/pages/AuditLogs.tsx` | Add `SELF_REVIEW_RECALLED` icon/label/color |
| `src/components/dashboard/KpiTimeline.tsx` | Add recalled action config |
| `src/components/review/KpiJourneySection.tsx` | Add recalled action label |
| `src/pages/reports/AuditTrailReport.tsx` | Add recalled action mapping |
| `DOCUMENTATION.md` | Version bump + feature docs |
| `POLICY.md` | Add §XX Self-Review Recall Policy |

### Risk Assessment
- **Data Impact**: No schema changes. Uses existing `system_settings` upsert and `kpi_audit_logs` insert.
- **Workflow Impact**: Only affects `self_review → kra_set` transition (backwards). No downstream impact since manager hasn't acted.
- **Regression Risk**: Low — recall is blocked if manager has entered any data, preventing data loss.
- **Security**: Employee can only recall their own KPIs. RLS already restricts KPI updates to owner at `kra_set` status.

