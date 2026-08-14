# Binay Singh (102013) — rollback failure & July KRA entry

## What the data shows (verified)

**Rollback error — root cause confirmed.**
The KPI in the screenshot ("Inventory Compliance to min max levels", July 2026) was **fully reset by an admin on 15 Jul** (audit action `ADMIN_FULL_RESET`), which moved it back to `kra_set` — the *first* stage of the workflow — and cleared the self score.
Requesting a rollback asks the system for "the stage before the current one". At `kra_set` there is no earlier stage, so the request aborts with the internal message *"Cannot determine rollback target status"*. The defect is that the **Request Rollback action is still offered on a KPI that is already at the first stage**, and the failure is reported in developer language.

**July KRA data entry — no lock found.**
- July 2026 period stage = `planning`, `is_locked = false`.
- No employee, department or role lock exists for July 2026 (the only locks in the system are September 2025).
- All 9 of Binay's July KPIs sit at `kra_set` (6) or `self_review` (3) — both are editable states for the employee.

So nothing in the period-governance or workflow data is blocking July. The remaining plausible causes are UI-side (period selector, or the assisted/proxy path). This needs one reproduction detail before a fix is claimed, so the plan makes that step explicit rather than guessing.

## Plan

### 1. Fix the rollback dead-end (the confirmed bug)
- In the rollback hook, detect "already at the earliest workflow stage" as a distinct, expected condition instead of a generic failure, and surface a plain-language message: *"This KPI is already at the first stage (KRA Set). Edit and resubmit it instead of requesting a rollback."*
- In `UnifiedScorecard` and `SelfReviewSheet`, **hide the Request Rollback button** when the KPI status is the first stage of its resolved workflow. A sent-back KPI already is the rollback outcome — offering the action again is meaningless.
- The Request Rollback dialog gets the same guard so a stale render cannot submit an impossible request.

### 2. Make the reset visible to the employee
The employee's self-review sheet already shows a "Sent Back" banner when a reset leaves a prior submission behind. Three of Binay's six `kra_set` July KPIs have no prior submission at all (they were never submitted), so they show nothing. Add a neutral inline hint on first-stage KPIs — *"Awaiting your self-review for July 2026"* — so it is obvious the row is editable, not locked.

### 3. Confirm the July entry symptom before changing gating logic
Reproduce in the preview as Binay: open July 2026, open one `kra_set` KPI, and record whether the sheet renders editable or "Read Only". Only if it renders read-only do we change gating — and the fix then targets the specific gate observed, not a blanket bypass. No self-review permission gate is loosened without that evidence.

### 4. Tests and documentation
- Unit tests: first-stage rollback returns the friendly guard (no request row created); mid-workflow rollback still resolves the previous stage correctly.
- ADR-257 + POLICY entry: *a rollback request is only valid from a stage that has a predecessor*; admin full reset already lands the KPI at the earliest stage.
- Update DOCUMENTATION.md version history and CHANGELOG.

## Risk & impact
- **Data:** none — no schema or row changes; UI/validation only.
- **Workflow:** rollback remains available at every stage that actually has a predecessor. Only the impossible case is removed.
- **Regression risk:** low; the change is confined to the rollback entry points and one advisory banner.
- **Rollback strategy:** purely additive frontend guards, revertible in one change.
