
# Bug RCA — "Compliance to contract shipment/delivery date" (Dippendu Das, Mar-2026)

## What the screenshot shows
- Header badge: **KRA Set · March 2026 · 8%**
- Review Journey: Self = Rating 5, Auditor = Pending, Management = Pending
- KPI History: Apr-26 row also shows **0/100, score 0, KRA SET**
- Past months (Jan/Feb/Nov-25/Dec-25) properly **APPROVED** with score 5

The user expects this KPI to be at "Auditor / Pending" since Self is done and the workflow chain is Self → Auditor → Management. Instead it appears stuck at "KRA Set".

## Root cause (verified against DB + code + audit log)

The KPI's `status` in the database is **literally `NULL`** (8 KPIs project-wide affected, all in March 2026, all touched by manager `876f255c…`).

The audit trail for this KPI proves the corruption sequence:

```text
1. STATUS_TRANSITION  old=kra_set     → new=self_review   (employee submitted)
2. SUBMISSION_SCORE_CHANGED  manager_score: null→5        (manager entered score)
3. STATUS_TRANSITION  old=self_review → new=NULL          ← BUG
4. MANAGER_FORWARDED  manager_score=5, manager_rating=blue
```

### Why status became NULL

Dippendu's effective workflow chain (verified via `get_employee_workflow_info`) is:

```text
[kra_set, self_review, audit, management_review, approved]
```

Notice — **`manager_check` is NOT in this chain.** Yet the reporting manager opened the Manager Scorecard for this employee and forwarded the KPI.

Inside `src/components/review/UnifiedScorecard.tsx` (line 681):

```ts
const newStatus = approve ? config.forwardStatus : config.activeReviewStage;
await supabase.from('kpis').update({ status: newStatus as any })...
```

`config.forwardStatus` is computed by `resolveForwardStatus('manager', stages)` in `src/lib/workflowEngine.ts` (line 165). When `manager_check` is absent from the chain, the guard at lines 182–184 returns **`null`**:

```ts
if (ownedStage && !workflowStages.includes(ownedStage)) {
  return null;   // ← returned for Dippendu
}
```

`null as any` is then written into `kpis.status`, which is a nullable `review_status` enum column → DB happily stores **NULL**, and the audit trigger logs `new_value: status=null`.

### Why the UI then says "KRA Set"

`src/components/dashboard/MobileKpiCard.tsx` line 85:

```tsx
<Badge className={statusColors[kpi.status || 'kra_set']}>
  {statusLabels[kpi.status || 'kra_set']}
</Badge>
```

The `|| 'kra_set'` fallback **silently mislabels NULL status as "KRA Set"**, hiding the data corruption from users and reviewers.

### Why the manager could act at all

`EmployeeSelectorGrid` / `useProfilesByWorkflowStage` exposes any employee with KPIs at `self_review` to the reporting manager, regardless of whether `manager_check` exists in that employee's pipeline. The Manager scorecard should not even be reachable for employees whose chain skips `manager_check`.

## Affected data (DB-verified)

8 KPIs across 2 employees, all March 2026, all status = NULL:
- Dippendu Das — 3 KPIs (incl. the one in the screenshot)
- Love Sahrawat — 5 KPIs

All have a `manager_score` populated and the audit log shows `STATUS_TRANSITION → null` performed by the same manager UID.

The "Apr-26 / KRA SET" row is a separate, **legitimate** record (April KPI is genuinely in `kra_set` — newly rolled-over, not yet self-submitted). That one is fine.

---

# Fix plan

## 1. Stop the bleed (UI gate)

In `UnifiedScorecard.tsx` `submitReview` mutation (and the two sibling mutations that contain the same `newStatus = approve ? config.forwardStatus : …` pattern at lines 1024, 1094, 1160):

- Before any `update({ status })`, **assert** `config.forwardStatus !== null && config.activeReviewStage !== null`.
- If null, throw a friendly error: *"This employee's workflow does not include the {viewLevel} stage. Please contact admin to fix the workflow configuration."*
- This guarantees `kpis.status` can never be set to NULL again from any reviewer flow.

## 2. Hide the Manager view when the chain has no `manager_check`

In `EmployeeSelectorGrid` / `useProfilesByWorkflowStage` (the selector that surfaces employees to the Manager view):

- Filter out employees whose effective workflow chain (per period) does not contain the role's stage.
- The same guard already exists for skip_level / hr_pms / audit via `resolveReviewableStatuses`; extend the manager case to honour the per-employee chain instead of treating "self_review" as universally manager-reviewable.

## 3. Remove the misleading UI fallback

In `MobileKpiCard.tsx` (line 85-86) and any sibling renderer:

- Replace `kpi.status || 'kra_set'` with explicit handling:
  - If `kpi.status == null` → render an amber **"Status Missing"** badge (not "KRA Set").
- This makes any future regression visible immediately.

## 4. Data repair migration

A one-shot SQL migration that, for each affected KPI:

- Re-computes the correct status by replaying the audit log:
  - If `MANAGER_FORWARDED` exists and the chain has no `manager_check`, the manager action was illegitimate → **clear** `manager_*` fields on `review_submissions` and reset `kpis.status` to `'self_review'` so the auditor (the actual next stage) can pick it up.
  - If the chain DOES include `manager_check`, set status to the next stage after `manager_check` from the chain.
- Insert a `RECONCILE_STATUS` audit entry with reason `'null_status_repair_v1'` for traceability.
- Dry-run output first; user-approved before commit.

## 5. Regression test (BUG-035)

Add to `src/test/bugBountyFixes.test.ts`:

- `resolveForwardStatus('manager', ['kra_set','self_review','audit','management_review','approved'])` must return `null`.
- `submitReview` must throw when `config.forwardStatus` is null (mock the supabase client).
- `MobileKpiCard` rendering `kpi.status = null` must show "Status Missing" — never "KRA Set".

## 6. POLICY + DOCUMENTATION

- New §106 in `POLICY.md`: **No-NULL-Status Invariant** — `kpis.status` MUST NEVER be set to NULL by any application code path. All workflow advancement must resolve to a concrete enum value or fail loudly.
- Update `mem/architecture/pms/workflow-status-convention` with the per-employee guard and the UI-gating rule.
- Bump DOCUMENTATION.md version, record fix in change log.

---

## Risk & Impact

| Area | Impact |
|------|--------|
| Data | 8 historical KPIs corrected; rest of system unaffected |
| Workflow | Managers can no longer act on employees whose chain skips them — correct behaviour |
| UI/UX | "Status Missing" badge appears only for already-corrupt rows (zero after repair) |
| Regression | Three new unit tests + the runtime guard make recurrence impossible |
| Mitigation | Dry-run repair report shown before commit; client-side guard before DB write |

## Out of scope

- Auditing whether the manager intentionally bypassed workflow vs UI bug (audit log already captures user). 
- Refactoring the four duplicated `newStatus = approve ? …` blocks in UnifiedScorecard into a shared helper (separate clean-up PR).
