# Binay Singh (102013) — July 2026 self-review shows read-only

## What the database says (verified)

- Binay is active; July 2026 and August 2026 periods are both in `planning` stage, `is_locked = false`.
- There are **no** review period locks (employee, department, role or global) for July/August 2026, so the governance permission function returns the permissive defaults — `submit_self_review = true`, `view_only = false`.
- His July KPIs: 6 at `kra_set`, 3 at `self_review`. Both of those states are editable states in the self-review sheet.
- Two July KPIs (including "Inventory Compliance to min max levels") sit at `kra_set` **with** an existing submission row whose value fields were cleared — the send-back / reset signature.

Conclusion: nothing in the data explains a read-only screen. The lock is coming from the client-side gate, and the exact gate is not yet confirmed. So step 1 of this plan is to make the app tell us (and the user) which gate fired, instead of guessing.

## Diagnosis gap

The sheet computes read-only from four independent inputs (KPI status, governance permission RPC, org-level data ownership, sub-period requirement). When it renders "Read Only" the user gets no reason, and we cannot tell from the outside which input was responsible. The screenshot in fact shows the *editable* title ("Submit Self Review") with a greyed Submit button, which points at either a disabled-input path (org data lock) or an unmet submit precondition — a different failure from a true read-only lock.

## Plan

### 1. Make the lock self-explaining (the permanent fix for this class of report)
- Add a small reason resolver that turns the gate inputs into one plain-language cause, in priority order: period closed/locked, governance permission denied, KPI past self-review stage, org-level value owned elsewhere, sub-period selection pending.
- Show that reason next to the "Read Only" badge, and as a tooltip on a disabled Submit button ("Enter an achieved value", "Remarks are required", "Waiting for org data owner", etc.).
- This ends the loop of screenshots that say "read-only" without saying why, for every employee, not just Binay.

### 2. Reproduce with Binay's own session
- Sign the preview in as Binay and open July 2026 in My KPIs, capture the resolved reason. If the reason turns out to be a real bug (for example a governance check failing transiently and defaulting the wrong way, or the org-data lock firing on a non-org KPI), fix that gate; if it is a legitimate state, the new message tells him what to do.

### 3. Clean the two reset artifacts
- The two July KPIs at `kra_set` that still carry a stale submission row with emptied values render inconsistently (the July row is missing from KPI History while August and June show). Normalise those rows so a `kra_set` KPI with no self values behaves exactly like a fresh one, and add a guard so a reset always leaves the submission consistent with the KPI status.

### 4. Documentation
- New ADR (ADR-258) plus POLICY entry: an edit lock must always state its reason; DOCUMENTATION.md and CHANGELOG_2026.md updated.

## Risk and impact

- **Data impact:** none in step 1/2. Step 3 touches only Binay's two stale rows plus a forward-looking guard; reversible from the audit trail.
- **Workflow impact:** no stage, reviewer or scoring behaviour changes. Only messaging becomes richer.
- **UI impact:** one reason line under the Read Only badge in the self-review sheet, and a tooltip on the disabled Submit button. No layout shift on mobile.
- **Regression risk:** low — the resolver is pure and additive; the existing boolean gate is untouched.
- **Tests:** unit tests for the reason resolver covering each gate and the precedence order, plus a regression test that a `kra_set` KPI with a cleared submission is treated as editable.

## Technical notes

- Gate logic lives in `src/components/review/SelfReviewSheet.tsx` (`isReadOnly`, `isGovernanceLocked`, `isOrgLocked`, `hasOrgData`).
- Governance values come from `useReviewPeriodPermissions` → `check_review_period_permission`; it fails open per action, so a transient RPC error cannot be the cause of a lock — worth asserting in the resolver tests.
- New file: `src/lib/review/editLockReason.ts` (SSOT), consumed by the sheet and by the tablet/mobile entry surfaces.
