

## Brainstorm: Workflow & Status Consistency Fixes

### Two Issues Identified

**Issue A: Reconciliation "scored not forwarded" can skip workflow stages**

The `reconcile_workflow_statuses` function (Branch 2b) detects KPIs where the current stage has a score but status wasn't forwarded. It checks if a "next reviewer exists" in the workflow — if one does, it skips (CONTINUEs). If not, it advances the status to `v_stage_keys[v_current_idx + 1]`.

The guard logic is correct: it only advances when no subsequent reviewer stage exists. The `v_next_reviewer_exists` check prevents stage-skipping. However, there's a subtle fragmentation risk: Branch 3 ("review_stage_mismatch") scans backwards from the end and can jump a KPI forward to a later stage if a downstream score exists — even if intermediate stages haven't been scored. This is rollback-aware (checks `kpi_audit_logs`), but the interaction between Branch 2b and Branch 3 is under-documented.

**Recommendation**: No code change needed. Add documentation clarifying the reconciliation branch precedence and interaction. Branch 2b is safe (guarded). Branch 3 is safe (rollback-aware). Document this explicitly in POLICY.md.

---

**Issue B: Send-back to `kra_set` erases ALL reviewer context**

Two competing data-clearing mechanisms exist:

1. **Application-level clear** (UnifiedScorecard line 707-774): Surgically clears fields from the target stage onward. When `newStatus === 'kra_set'`, it only sets `kpi_status = 'open'` and preserves self-level data.

2. **Database trigger** (`trg_sync_submission_on_kra_set`, migration `20260217...`): Fires on ANY `kpis.status` → `kra_set` transition and nukes ALL fields including self-review data.

The trigger overrides the application's surgical clear. Even though the app code preserves self data (line 717-719), the trigger immediately wipes everything. The employee loses their own remarks, achieved values, and evidence — plus all reviewer feedback context.

The `SentBackBanner` partially mitigates this by showing the send-back reason from `kpi_queries`, but the detailed reviewer remarks (which explain what was wrong with specific scores) are destroyed.

**Root Cause**: The trigger was enhanced in v1.45.1 as a "safety net" to guarantee no stale data, but it's now overly aggressive — it conflicts with the deliberate preservation logic added later in the UnifiedScorecard.

### Proposed Fix for Issue B

**Modify `trg_sync_submission_on_kra_set` to preserve employee self-review data.**

Current trigger clears ALL 30+ fields. Change it to only clear manager-and-above fields, matching the application-level intent:

```sql
CREATE OR REPLACE FUNCTION public.sync_submission_on_kra_set()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'kra_set' AND OLD.status IS DISTINCT FROM 'kra_set' THEN
    UPDATE public.review_submissions
    SET kpi_status = 'open',
        -- Preserve self_* fields so employee sees what they submitted
        manager_rating = NULL, manager_score = NULL, manager_remarks = NULL,
        manager_evidence_url = NULL, manager_evidence_urls = NULL,
        manager_achieved_value = NULL,
        skip_level_rating = NULL, skip_level_score = NULL, skip_level_remarks = NULL,
        skip_level_evidence_url = NULL, skip_level_evidence_urls = NULL,
        skip_level_achieved_value = NULL,
        hr_pms_rating = NULL, hr_pms_score = NULL, hr_pms_remarks = NULL,
        hr_pms_evidence_url = NULL, hr_pms_evidence_urls = NULL,
        hr_pms_achieved_value = NULL,
        auditor_rating = NULL, auditor_score = NULL, auditor_remarks = NULL,
        auditor_evidence_url = NULL, auditor_evidence_urls = NULL,
        auditor_achieved_value = NULL,
        management_rating = NULL, management_score = NULL, management_remarks = NULL,
        management_evidence_url = NULL, management_evidence_urls = NULL,
        management_achieved_value = NULL,
        final_rating = NULL, final_score = NULL,
        is_na = false, na_marked_by_role = NULL,
        updated_at = now()
    WHERE kpi_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

This preserves: `self_score`, `self_rating`, `self_remarks`, `self_evidence_url`, `self_evidence_urls`, `achieved_value`. Employee can see what they originally submitted when revising.

### Also fix: `useSendBackKpi` hook (manager send-back)

The `useSendBackKpi` hook (line 1017-1049) clears manager+ fields but the trigger then fires and redundantly clears everything again (including self fields the hook preserved). After fixing the trigger, the hook's clear logic becomes consistent with the trigger.

However, `useSendBackKpi` also clears `final_rating` and `final_score` — this is correct and should stay.

### Files to Change

| File | Change |
|------|--------|
| Database migration | Update `sync_submission_on_kra_set` to preserve self-review fields |
| `POLICY.md` | Document send-back data preservation policy (self data kept, reviewer data cleared) |
| `POLICY.md` | Document reconciliation branch precedence (Branch 2b guarded, Branch 3 rollback-aware) |
| `DOCUMENTATION.md` | Version bump, update send-back trigger description |

### Risk Assessment
- **Data Impact**: Self-review data will now persist through send-backs. This is additive — employees see their original submission instead of a blank form.
- **Workflow Impact**: None — status transitions unchanged. The trigger still fires on `kra_set` transitions.
- **Regression Risk**: Low — the trigger's field-clearing is narrowed, not removed. All reviewer-level fields are still cleared. The application-level code in UnifiedScorecard already handles this identically.
- **Security**: No RLS changes. The trigger remains `SECURITY DEFINER`.

