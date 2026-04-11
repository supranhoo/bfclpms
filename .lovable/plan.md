

## Revised Plan: Employee Self-Review Compliance Penalty (Enhanced)

### What Changed from Previous Plan
Two additions per user request:
1. **Zero-score ALL pending KPIs** at `kra_set` level (not just the compliance KPI) when the deadline passes
2. **Configurable exclusion toggles** — admin can toggle on/off each exclusion category from the UI

### Full Feature Scope

**When the configurable deadline day passes**, the system:
1. Scans all employees with rolled-out KRAs for the selected period
2. Identifies KPIs still at `kra_set` or `self_review` status
3. Applies admin-configured exclusions (each independently toggleable)
4. **Zero-scores ALL remaining pending KPIs** (not just the compliance KPI)
5. **Additionally** zero-scores the employee's "Implementation of common - policies / systems / processes" KPI as a compliance penalty (even if that KPI was already submitted)

### Configurable Exclusions (UI Toggles)

Each stored as a `system_settings` key with boolean value:

| Setting Key | Label | Default |
|-------------|-------|---------|
| `compliance_exclude_org_kpi` | Exclude Org-level KPIs | ON |
| `compliance_exclude_sent_back` | Exclude Sent-back KPIs | ON |
| `compliance_exclude_quarterly_not_due` | Exclude Quarterly KPIs not due | ON |
| `compliance_exclude_bimonthly_not_due` | Exclude Bi-Monthly KPIs not due | ON |
| `compliance_exclude_halfyearly_not_due` | Exclude Half-Yearly KPIs not due | ON |
| `compliance_exclude_yearly_not_due` | Exclude Yearly KPIs not due | ON |
| `compliance_penalty_deadline_day` | Deadline day of following month | 10 |
| `compliance_penalty_enabled` | Enable/Disable feature | OFF |
| `compliance_penalty_auto_remark` | System remark for zeroed KPIs | "Self-review not completed by due date" |

### Settings Panel UI

Added to the existing Settings panel in PendingSelfReviews:

```text
┌─ Compliance Penalty Settings ──────────────────────────┐
│ Enable Compliance Penalty:  [toggle ON/OFF]            │
│ Deadline Day: [10]  Remark: [___________________]      │
│                                                        │
│ Exclusions:                                            │
│ ☑ Exclude Org-level KPIs                               │
│ ☑ Exclude Sent-back KPIs                               │
│ ☑ Exclude Quarterly KPIs (not due)                     │
│ ☑ Exclude Bi-Monthly KPIs (not due)                    │
│ ☑ Exclude Half-Yearly KPIs (not due)                   │
│ ☑ Exclude Yearly KPIs (not due)                        │
│                                         [Save Settings]│
└────────────────────────────────────────────────────────┘
```

### Compliance Penalty Tab UI

New tab in PendingSelfReviews page:

```text
┌──────────────────────────────────────────────────────────┐
│ [Penalize Selected] [Penalize All] [Rollback] [Export]   │
├────┬────────────┬──────┬──────────┬─────────┬──────────┤
│ ☐  │ Employee   │ Code │ Dept     │ Pending │ Status   │
├────┼────────────┼──────┼──────────┼─────────┼──────────┤
│ ☑  │ John Doe   │ E001 │ Safety   │ 3 KPIs  │ Ready    │
│ ☑  │ Jane Smith │ E002 │ Ops      │ 1 KPI   │ Ready    │
│    │ Ali Khan   │ E003 │ Finance  │ 0 KPIs  │ Penalized│
└────┴────────────┴──────┴──────────┴─────────┴──────────┘
```

- **Pending**: count of non-excluded KPIs at `kra_set`/`self_review` that will be zeroed
- **Status**: "Ready" (can be penalized), "Penalized" (already done), "No Compliance KPI" (missing the policy KPI)
- Clicking "Penalize" zeros ALL pending KPIs + the compliance KPI
- Rollback reverts all KPIs penalized in that batch

### Implementation Plan

| # | File | Change |
|---|------|--------|
| 1 | `src/hooks/usePendingSelfReviews.ts` | Add `useCompliancePenaltySettings()` — reads all `compliance_*` settings, returns exclusion flags + deadline + remark |
| 2 | `src/hooks/usePendingSelfReviews.ts` | Add `useNonCompliantEmployees(deadlineDay, month, year, exclusions)` — scans all employees, applies configurable exclusions, returns non-compliant list with pending KPI IDs |
| 3 | `src/hooks/usePendingSelfReviews.ts` | Add `useBulkCompliancePenalty()` — zeros ALL pending KPIs for selected employees + their compliance KPI, logs `EMPLOYEE_COMPLIANCE_PENALTY` audit action |
| 4 | `src/hooks/usePendingSelfReviews.ts` | Add `usePenalizedComplianceKpis()` + `useRollbackCompliancePenalty()` — fetch penalized records and revert them |
| 5 | `src/pages/admin/PendingSelfReviews.tsx` | Add compliance penalty settings section to Settings panel with exclusion toggles |
| 6 | `src/pages/admin/PendingSelfReviews.tsx` | Add new "Compliance Penalty" tab with scan results table, penalize/rollback buttons, Excel export |
| 7 | `DOCUMENTATION.md` | Document feature v2.33.7 |
| 8 | `POLICY.md` | Sync version v1.92.7 |

### Penalty Execution Logic

```typescript
// For each non-compliant employee:
// 1. Get all their KPIs for the period
// 2. Apply exclusion filters based on admin toggles:
//    - if exclude_org_kpi: skip is_org_level=true
//    - if exclude_sent_back: skip KPIs with send_back in kpi_queries
//    - if exclude_quarterly_not_due: skip Quarterly KPIs where cycle not complete
//    - if exclude_bimonthly_not_due: skip Bi-Monthly where cycle not complete
//    - if exclude_halfyearly_not_due: skip Half-Yearly where cycle not complete
//    - if exclude_yearly_not_due: skip Yearly where cycle not complete
// 3. Zero-score ALL remaining KPIs at kra_set/self_review
// 4. Additionally zero the compliance KPI regardless of its current status
// 5. Audit log each action with batch_id for rollback
```

### Risk Assessment
- **Data impact**: Zeros multiple KPIs per employee — all auditable with batch rollback
- **Regression risk**: Low — new hooks and tab, no changes to existing penalty flows
- **Reversibility**: Full batch rollback restores all KPIs to pre-penalty state
- **Configurability**: All exclusions admin-toggleable, no hardcoded business rules

