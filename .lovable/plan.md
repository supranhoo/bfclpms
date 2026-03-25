

## RCA: `self_review` Missing from Branch 2b Normal Resting State Exclusion

### Root Cause

The screenshot shows 77 KPIs at **Self Review** status being flagged as "Scored Not Forwarded" with a target of **Audit Review**. This is incorrect.

**What happens in the architecture:**
- Employee submits self-review → `self_score` is saved, status stays at `self_review`
- The KPI now waits for the **manager** to act (score and forward)
- `self_review` with a `self_score` is the **normal resting state** — the employee is done, the manager hasn't acted yet

**What Branch 2b does wrong:**
The exclusion list at line 167 is:
```sql
IF v_kpi.current_status IN ('manager_check', 'skip_level_check', 'hr_pms_review', 'audit') THEN
```

`self_review` is **missing**. So the tool sees `self_review` + `self_score` exists → flags it as "scored not forwarded" → recommends jumping to audit. This skips the manager review entirely.

### Fix

**1 file: DB migration** — Add `'self_review'` to the Branch 2b exclusion list:

```sql
IF v_kpi.current_status IN ('self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit') THEN
```

This ensures KPIs waiting for the next reviewer after the current stage's score has been entered are recognized as normal in-progress items.

### Complete Exclusion Table After Fix

| Status | Score field present | Meaning | Excluded? |
|--------|-------------------|---------|-----------|
| `self_review` | `self_score` | Employee submitted, waiting for manager | ✅ **Adding** |
| `manager_check` | `manager_score` | Manager scored, waiting for next reviewer | ✅ Already |
| `skip_level_check` | `skip_level_score` | Skip-level scored, waiting | ✅ Already |
| `hr_pms_review` | `hr_pms_score` | HR scored, waiting | ✅ Already |
| `audit` | `auditor_score` | Auditor scored, waiting | ✅ Already |

### Files Changed
1. **DB migration** — Add `'self_review'` to the IN clause in Branch 2b's normal resting state check

