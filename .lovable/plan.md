

## Fix Stage Alignment Across All Dashboards

### Root Cause

The workflow status names represent **who has already acted**, not who needs to act next:

| Status | Meaning | Who needs to act next |
|--------|---------|----------------------|
| `kra_set` | KRA assigned | **Employee** (self review) |
| `self_review` | Employee submitted | **Manager** |
| `manager_check` | Manager reviewed | **Skip-level** (or next) |
| `skip_level_check` | Skip-level reviewed | **HR PMS / Audit** |
| `hr_pms_review` | HR PMS reviewed | **Audit** |
| `audit` | At auditor | **Auditor** (active) |
| `management_review` | At management | **Management** (active) |

The 3 special dashboards and the Audit stats tile are all **off by one stage** — they match the status name instead of the actor who needs to act.

### Current Bugs (all in `EmployeeSelectorGrid.tsx`)

**1. `pending_self_review`** — currently counts `status === 'self_review'`
- WRONG: `self_review` = employee HAS submitted → pending at manager
- CORRECT: should count `kra_set` (employee hasn't submitted yet)
- Affected: stats (line 622), filter (line 483), badge (line 361)

**2. `pending_manager_review`** — currently counts `status === 'manager_check'`
- WRONG: `manager_check` = manager HAS reviewed → pending at next level
- CORRECT: should count `self_review` (employee submitted, awaiting manager)
- Affected: stats (line 625), filter (line 487), badge (line 366)

**3. `pending_skip_review`** — currently counts `status === 'skip_level_check'`
- WRONG: `skip_level_check` = skip-level HAS reviewed
- CORRECT: should count `manager_check` (manager done, awaiting skip-level)
- Affected: stats (line 628), filter (line 491), badge (line 371)

**4. Audit "Pending" stats tile** (line 579-593) — counts ALL stages before `audit` excluding `kra_set`
- WRONG: includes `self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`
- CORRECT: should only count the stage immediately before `audit` (using `resolveReviewableStatuses`)
- Note: filter logic (line 448) and badge logic (line 350) already use `resolveReviewableStatuses` correctly — only the stats tile is wrong

**5. HR PMS, Management** — already correct. No changes needed.

### Fix — Single file: `src/components/review/EmployeeSelectorGrid.tsx`

**a) Badge computation (lines 359-373)** — fix status matching:
```
pending_self_review:    kra_set       (was self_review)
pending_manager_review: self_review   (was manager_check)
pending_skip_review:    manager_check (was skip_level_check)
```

**b) Filter logic (lines 482-493)** — fix status matching:
```
pending_self_review:    kra_set       (was self_review)
pending_manager_review: self_review   (was manager_check)
pending_skip_review:    manager_check (was skip_level_check)
```

**c) Stats computation (lines 621-629)** — fix status matching:
```
pending_self_review:    kra_set       (was self_review)
pending_manager_review: self_review   (was manager_check)
pending_skip_review:    manager_check (was skip_level_check)
```

**d) Audit stats tile (lines 579-593)** — replace broad `beforeAudit` counting with `resolveReviewableStatuses('auditor', stages)`:
```typescript
const auditReviewable = resolveReviewableStatuses('auditor', stages);
if (auditReviewable.includes(k.status || '') && k.status !== 'audit') pending++;
```

### Expected Results After Fix

For February (where most KPIs are at `kra_set` or `self_review`):
- **Self Review tab**: shows employees with `kra_set` KPIs (employee hasn't submitted)
- **Manager Review tab**: shows employees with `self_review` KPIs (awaiting manager)
- **Skip Mgr Review tab**: shows employees with `manager_check` KPIs (awaiting skip-level)
- **HR PMS**: only KPIs at stage immediately before `hr_pms_review` (already correct)
- **Audit**: only KPIs at stage immediately before `audit` (fixed from broad count)
- **Management**: KPIs at `management_review` (already correct)

### No other files changed. No database changes needed.

