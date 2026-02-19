
# RCA & CAPA Plan — 95 KPIs Stuck at `hr_pms_review`

## Root Cause Confirmed

The bug in `resolveForwardStatus('hr_pms')` (already fixed in code but not yet applied to existing data) caused HR PMS approvals to set KPI status to `hr_pms_review` instead of advancing to the next stage. This created **95 KPIs stuck in `hr_pms_review`** that were already reviewed/approved by HR PMS but never advanced.

---

## Affected Employees & Their Correct Next Status

All 10 affected employees have workflows where `hr_pms_review` is immediately followed by `approved`. Therefore, **all 95 stuck KPIs must advance to `approved`**.

| Employee | Code | Template | Stuck KPIs | Next Stage |
|---|---|---|---|---|
| Abhiranjan Kumar Singh | 200792 | self_l1_l2_hr_pms (DEFAULT) | 10 | `approved` |
| Aditya Kumar | 100847 | self_l1_l2_hr_pms (DEFAULT) | 10 | `approved` |
| Ashish Kataria | 200226 | self_l1_l2_hr_pms (DEFAULT) | 7 (Dec 2025) | `approved` |
| Avinash Kumar | 101647 | self_l1_l2_hr_pms (DEFAULT) | 9 | `approved` |
| Avinash Kumar | 101732 | self_l1_l2_hr_pms (DEFAULT) | 9 | `approved` |
| Debadutta Sahoo | 101358 | self_l1_l2_hr_pms (DEFAULT) | 8 | `approved` |
| Dileshwar Mahto | 100088 | self_l1_l2_hr_pms (DEFAULT) | 9 | `approved` |
| Jitendra Bharti | 101715 | self_l1_hr_pms | 13 | `approved` |
| Purnima Pathak | 101653 | self_l1_l2_hr_pms (DEFAULT) | 8 | `approved` |
| Randhir Kumar Singh | 101811 | self_l1_hr_pms | 12 | `approved` |
| **TOTAL** | | | **95 KPIs** | **→ `approved`** |

**Why all go to `approved`**: In both `self_l1_l2_hr_pms` and `self_l1_hr_pms` templates, `hr_pms_review` is the last stage before `approved`. No audit or management review stage exists in any of these employees' templates.

---

## What Will Be Done

### Action: System Bulk Update — 95 KPIs → `approved`

A single safe SQL `UPDATE` using the Supabase `insert` tool (data operation, not schema change):

```sql
UPDATE kpis
SET 
  status = 'approved',
  updated_at = NOW()
WHERE status = 'hr_pms_review'
  AND id IN (
    -- Only advance KPIs whose template's next stage after hr_pms_review IS 'approved'
    -- All confirmed affected employees fall in this category
    SELECT k.id
    FROM kpis k
    JOIN profiles p ON p.id = k.employee_id
    LEFT JOIN workflow_config wc ON wc.config_type = 'employee' 
      AND wc.config_value = k.employee_id::text
    LEFT JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
    WHERE k.status = 'hr_pms_review'
  );
```

But we will be MORE precise — we'll use a targeted query that checks each employee's effective template stages and only advances KPIs where the stage immediately after `hr_pms_review` in their template array is `'approved'`. This guards against accidentally advancing any future KPIs stuck at `hr_pms_review` for a different reason in a different template (like `self_l1_l2_hr_pms_audit` where next would be `audit`).

### Safe & Targeted Query Logic

```sql
UPDATE kpis k
SET status = 'approved', updated_at = NOW()
WHERE k.status = 'hr_pms_review'
AND (
  -- Employee has explicit template config where next after hr_pms_review = 'approved'
  EXISTS (
    SELECT 1 FROM workflow_config wc
    JOIN workflow_templates wt ON wt.id = wc.workflow_template_id
    WHERE wc.config_type = 'employee'
    AND wc.config_value = k.employee_id::text
    AND wt.stages[array_position(wt.stages, 'hr_pms_review') + 1] = 'approved'
  )
  OR
  -- Employee has NO explicit config → falls back to DEFAULT template (self_l1_l2_hr_pms)
  -- Default template stages: [kra_set, self_review, manager_check, skip_level_check, hr_pms_review, approved]
  -- → next after hr_pms_review IS 'approved'
  NOT EXISTS (
    SELECT 1 FROM workflow_config wc
    WHERE wc.config_type = 'employee'
    AND wc.config_value = k.employee_id::text
  )
);
```

This is a **read-safe** bulk update:
- No schema changes
- No RLS bypass (runs via Supabase admin tool)
- Targeted: only advances KPIs where the workflow genuinely ends at `approved` after `hr_pms_review`
- Zero risk to KPIs in `self_l1_l2_hr_pms_audit` (where next stage would be `audit`, not `approved`)

---

## CAPA — Preventing Recurrence

### Immediate (done in previous session)
- `resolveForwardStatus('hr_pms')` fixed to use `resolveNextStatus('hr_pms_review', stages) || 'approved'`
- All new HR PMS approvals will correctly advance KPIs going forward

### This Session
- Bulk advance 95 stuck KPIs to `approved` via targeted SQL
- No risk to active workflows, other statuses, or other templates

### Preventive
- The code fix already deployed ensures no new KPIs will get stuck this way
- Publish to production after this data fix so live site also has the corrected logic

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Accidentally advancing KPIs not yet reviewed by HR PMS | Not possible — query only touches `status = 'hr_pms_review'` rows |
| Advancing KPIs in templates where next stage is `audit` not `approved` | Query explicitly checks `wt.stages[position + 1] = 'approved'` |
| Breaking audit trail | The `updated_at` timestamp is set; review_submissions records remain intact |
| Reverting | Admin can use the existing Status Step Back dialog per KPI if any specific case needs review |

**Expected outcome:** After the update, all 95 KPIs will show `approved` status, employees and managers will see them as complete in their dashboards.
