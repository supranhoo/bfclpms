# Add per-employee KRA Rollover from the scorecard header

## Feasibility

**High — minimal new code required.** The existing admin rollover flow already scopes by employee:

- `RolloverDialog` (`src/components/admin/RolloverDialog.tsx`) drives the entire 3-step flow (Configure → Preview → Results) and calls the `auto-rollover-kpis` edge function with an optional `employee_ids: string[]` filter. Single-employee mode is just `employee_ids: [employee.id]`.
- The "KPI Details" header in `UnifiedScorecard.tsx` already hosts admin-only buttons (`Zero-Score`, `KRA Export`, `Add KRA`), each gated by `isAdmin`. Adding one more button alongside them is the same pattern.
- The dialog already supports preview, conflict resolution (balance-only), Excel report download, and react-query invalidation of `['kpis']` — all of which we want in the per-employee flow too.

No DB / RLS / RPC changes. UI-only with one small prop addition to the existing dialog.

## Plan

### 1. Extend `RolloverDialog` with a "scoped" mode (one extra prop)

Add a new optional prop block to `RolloverDialogProps`:

```ts
scopedEmployee?: { id: string; name: string; code?: string };
```

When `scopedEmployee` is present, the dialog:

- Forces `allEmployees = false` and `selectedEmployeeIds = [scopedEmployee.id]` on open.
- Hides the "All Employees" switch and the employee picker list (replace with a read-only banner: `Rolling over KRAs for <name> (<code>)`).
- Defaults `targetMonth/Year` to the currently-displayed scorecard period (passed in via prop).
- Defaults `sourceMonth/Year` to the previous month of that target.
- Title becomes `KRA Rollover — <name>`.

Everything else (preview, conflicts, balance-only, results, Excel report) is reused unchanged. Edge-function payload is identical because it already accepts `employee_ids`.

Add two more optional props for the period defaults so the parent can hand them in:

```ts
defaultTargetMonth?: string;
defaultTargetYear?: number;
```

Backwards-compatible: existing call site in `SystemSettings.tsx` keeps current behavior when these props are omitted.

### 2. Add an admin-only "Rollover KRAs" button in `UnifiedScorecard`

In the KPI Details header (`src/components/review/UnifiedScorecard.tsx` ~line 1638), insert a new button next to `Zero-Score` / `KRA Export`, gated by `isAdmin && !isSelfMode-not-required` (we'll show it whenever an admin is viewing any scorecard with a concrete `employee` and `selectedPeriod` / `selectedYear`):

```
{isAdmin && (
  <Button size="sm" variant="outline" onClick={() => setRolloverOpen(true)}>
    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Rollover KRAs
  </Button>
)}
```

Render the dialog at the bottom of the component (next to `EmployeeBulkZeroScoreDialog`):

```
<RolloverDialog
  open={rolloverOpen}
  onOpenChange={setRolloverOpen}
  scopedEmployee={{ id: employee.id, name: employee.full_name, code: employee.employee_code }}
  defaultTargetMonth={selectedPeriod}
  defaultTargetYear={selectedYear}
/>
```

`isAdmin` is already available in `UnifiedScorecard` (it gates the existing Zero-Score button).

### 3. Visibility & access

- **Admin only.** Same `isAdmin` gate already used for `Zero-Score`. No new role check needed.
- **All scorecard contexts** (Self / Team / Audit / Skip-level / HR PMS / Management) — wherever the admin sees a KPI Details panel for a single employee, this button appears. This matches the user's request ("This feature will only be used by admin").
- Self-view: an admin viewing their own scorecard will also see it (consistent with existing Zero-Score button behavior).

### 4. UX details

- Button label: `Rollover KRAs` (matches existing `Zero-Score`, `KRA Export` casing).
- Icon: `RefreshCw` from `lucide-react` (same icon the dialog already uses for its title).
- After successful rollover, the dialog already invalidates `['kpis']`; the scorecard auto-refreshes — no extra glue needed.
- Banner inside the scoped dialog reuses existing `Alert` / `Card` styles for visual continuity.

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | None. Edge function `auto-rollover-kpis` already runs scoped rollovers; no schema, RLS, RPC, or trigger changes. |
| Workflow | None. Same 3-step preview/confirm/report flow; admin still has to confirm. Conflict + balance-only handling reused as-is. |
| Permissions | Strictly gated by `isAdmin` in the UI; the edge function enforces its own admin check server-side (unchanged). |
| UI/UX | One additional small button in an already-busy header. Visual rhythm matches `Zero-Score`. |
| Regression | Low. `RolloverDialog` change is additive (new optional props, no removal). Existing `SystemSettings` call site behaves identically. |
| Mitigation | Vitest covering the prop-driven defaults and the "scoped employee replaces picker" branch. Manual smoke: open from a scorecard, preview, run, verify only that employee's KPIs are copied and the scorecard refreshes. |

## Files (preview only — no edits in plan mode)

Edit:
- `src/components/admin/RolloverDialog.tsx` — add `scopedEmployee`, `defaultTargetMonth`, `defaultTargetYear` props; adjust initial state + Step-1 rendering.
- `src/components/review/UnifiedScorecard.tsx` — admin-only `Rollover KRAs` button in KPI Details header + mount `RolloverDialog` with scoped props.

Add:
- `src/test/scopedRolloverDialog.test.tsx` — verifies scoped employee locks the picker and forwards `employee_ids: [id]` in the edge-function payload.

Docs:
- `mem/features/admin/enhanced-kra-rollover-system` — append a "Per-employee invocation from scorecard" note.

## Out of scope

- Multi-employee selection from the scorecard (admin can still use System Settings → KRA Rollover for that).
- Changing the source/target defaults policy or the underlying edge function.
- Non-admin access (kept admin-only as requested).
