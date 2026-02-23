

# Fix Terminal Stage Resolution in Bottleneck Report (v1.45.93)

## Root Cause

The bottleneck resolver has a critical gap: when a KPI's status is the **last review stage before `approved`** in an employee's pipeline, it maps to the `approved` entry and gets silently dropped from the report.

**Your employees' actual workflow pipeline:**
`[kra_set, self_review, manager_check, skip_level_check, hr_pms_review, approved]`

There is NO `audit` or `management_review` stage. HR PMS is the **terminal reviewer**.

**What happens now with a KPI at `hr_pms_review`:**
1. It's not `kra_set`, `audit`, or `management_review` -- falls to general logic
2. `stages.indexOf('hr_pms_review')` = 4
3. `nextStage = stages[5]` = `'approved'`
4. `NEXT_STAGE_MAP['approved']` = `{ responsibleRole: '-', stageLabel: 'Approved' }`
5. Hook sees `responsibleRole === '-'` and **drops the KPI entirely**

Result: 110 KPIs at `hr_pms_review` vanish from the report. The Audit card shows 0 because no KPIs have `audit` status (the stage doesn't exist in the pipeline).

## Solution

When the next stage in the pipeline is `approved`, the KPI is at its **terminal review stage** -- the current reviewer is actively responsible. Instead of looking up the next stage, map the **current status** to its responsible role.

Additionally, `hr_pms_review` and `skip_level_check` should be treated as active stages (like `audit` and `management_review`) since in some pipelines they ARE the terminal reviewer.

## Technical Changes

### 1. `src/lib/bottleneckResolver.ts`

Add explicit handling for `hr_pms_review` and `skip_level_check` as active stages (same pattern as `audit` and `management_review`):

```
if (kpiStatus === 'hr_pms_review') return NEXT_STAGE_MAP['hr_pms_review'];   // awaiting_hr_pms
if (kpiStatus === 'skip_level_check') return NEXT_STAGE_MAP['skip_level_check']; // awaiting_skip_level
```

Also add a safety net: when the "next stage" resolves to `approved`, fall back to mapping the current status instead of dropping the KPI:

```
const nextStage = currentIndex + 1 < stages.length ? stages[currentIndex + 1] : 'approved';
if (nextStage === 'approved') {
  // Terminal stage — current reviewer is responsible
  return NEXT_STAGE_MAP[kpiStatus] || { stageKey: 'awaiting_management', stageLabel: kpiStatus, responsibleRole: '-' };
}
return NEXT_STAGE_MAP[nextStage] || { ... };
```

### 2. `src/lib/bottleneckResolver.test.ts`

Add test cases:
- `hr_pms_review` in a pipeline ending at `hr_pms_review -> approved` resolves to `awaiting_hr_pms`
- `skip_level_check` as terminal stage resolves to `awaiting_skip_level`
- `manager_check` as terminal stage (if pipeline is `[..., manager_check, approved]`) resolves to `awaiting_manager`

### 3. `DOCUMENTATION.md`

Bump to v1.45.93 and document the terminal-stage handling fix.

## Impact

After this fix:
- 110 KPIs at `hr_pms_review` will correctly appear under "HR PMS" in the Bottleneck Report
- The "Total Pending" count will increase from ~188 to ~298 (recovering the dropped KPIs)
- No KPIs will show under "Audit" (which is correct -- there IS no audit stage in your workflow)

Note: The Dashboard's "Pending Audit: 250" shown in the Audit Panel may itself be inaccurate due to a similar workflow resolution issue there. That would be a separate investigation if needed.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None -- read-only report | No schema changes |
| Regression | Low -- adds explicit handling for 2 more statuses + safety net | Existing test cases unaffected |
| Accuracy | High confidence | KPIs previously dropped will now be correctly categorized |

