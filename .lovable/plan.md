

## Fix: Enable Self-Review Recall Button

### Root Cause
The Recall hook queries `kpi_audit_logs` for `action = 'SELF_REVIEW_SUBMITTED'` to get the submission timestamp. But the self-review submission code in `useKpis.ts` (line 594-619) never writes this audit log. Result: the hook always returns "No submission record found" and hides the button.

### Why Not Use the KPI Status Directly?
The KPI `status` field tells us *current state* but not *when* the submission happened. The `updated_at` column changes on any update (not just submission), making it unreliable for the recall countdown timer. A dedicated audit log entry gives us the exact submission timestamp.

### Why Not Use a DB Trigger?
The `notify_on_kpi_status_change` trigger already fires on `kra_set → self_review`, but it creates **notifications**, not audit logs. Adding audit logging to the same trigger would mix concerns. The cleanest approach is a single `INSERT` in the application code, matching the pattern used everywhere else (e.g., `MANAGER_APPROVED`, `QUERY_RAISED`, `MANAGER_SENT_BACK` — all logged from hooks, not triggers).

### Safety Assessment
- `SELF_REVIEW_SUBMITTED` is a **brand-new action string** — no existing code, trigger, or RLS policy references it
- All display components (AuditLogs, KpiTimeline, AuditTrailReport, KpiJourneySection) already have labels/icons/colors for it (added in previous implementation) — they're just dormant
- It's a pure INSERT into `kpi_audit_logs` — zero side effects on any workflow

### Implementation

**1. `src/hooks/useKpis.ts`** — Add audit log after successful self-review submission (after line 619):
```typescript
// Fire-and-forget audit log for recall eligibility tracking
supabase.from('kpi_audit_logs').insert({
  kpi_id,
  action: 'SELF_REVIEW_SUBMITTED',
  performed_by: user?.id,
  old_value: { status: 'kra_set' },
  new_value: { status: 'self_review', achieved_value, self_score, self_rating },
}).then(); // non-blocking
```

**2. `DOCUMENTATION.md`** — Version bump

### What This Enables
- After this fix, any **new** self-review submission will create the audit entry
- The Recall button + countdown timer will appear immediately when reopening the KPI sheet
- Previously submitted KPIs (before this fix) will NOT show the Recall button — this is by design (no historical timestamp to calculate from)

### Files to Change

| File | Change |
|------|--------|
| `src/hooks/useKpis.ts` | Add `SELF_REVIEW_SUBMITTED` audit log insert after line 619 |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **Data Impact**: Additive only — new rows in existing table. No schema changes.
- **Workflow Impact**: Zero — audit log is informational; no trigger, RLS, or workflow depends on its presence or absence.
- **Regression Risk**: Zero — fire-and-forget pattern; if insert fails, submission itself is unaffected.

