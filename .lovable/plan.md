## Goal
Let Admin/HR choose the reference date used to evaluate **Minimum Service (months)** on the General Eligibility screen, instead of implicitly using "today" or run-time.

## Assumptions
- Today, `min_service_months` is compared against tenure computed at the moment the increment is run (implicit "today").
- Business wants a fixed cutoff per Assessment Year (e.g. service computed as of 31-Mar-2026) so reruns are deterministic and auditable.
- Anchor applies to the whole AY config row, not per-employee.

## Risk & Impact Report
- **Data:** Additive columns on `general_eligibility` (`service_as_on_mode`, `service_as_on_date`). No backfill needed; null = legacy "run date" behavior.
- **Workflow:** `compute-increment` tenure calculation switches to the resolved anchor date when set. Existing AY rows without the field keep current behavior (backward compatible).
- **UI/UX:** One new inline control next to the existing months input. No layout reflow on mobile (wraps below).
- **Regression:** Low. Guarded by mode flag; default = `run_date` preserves today's math.
- **Scalability:** No new queries, no new tables.
- **Rollback:** Drop the two columns; code falls back to run date.

## UI Changes (Configuration card → "Minimum Service" row)

Location: `src/pages/increment/GeneralEligibility.tsx`, replacing the current single inline months input.

```text
Minimum Service   [ 12 ] months   evaluated as of  ( ) Run date
                                                   ( ) AY end date (31-Mar-2026)
                                                   (•) Custom date  [ 31-Mar-2026 📅 ]
```

- **Months input** — unchanged (number, min 0).
- **"Evaluated as of" radio group** — three options:
  1. `Run date` (default, legacy behavior — tenure computed when increment is calculated).
  2. `AY end date` — auto-resolves to 31-Mar of the AY's closing year (e.g. AY 2025-26 → 31-Mar-2026). Read-only helper text shows the resolved date.
  3. `Custom date` — enables a date picker (shadcn `Calendar` in a `Popover`, same pattern as other date pickers in the codebase).
- **Validation:** if `Custom date` selected, date is required and must fall within the AY window (1-Apr-startYear … 31-Mar-endYear); otherwise Save is disabled with inline error.
- **Version History card** — append the anchor summary: `…· 0 mo as of 31-Mar-2026`.
- **Responsive:** controls wrap to a new line below the months input under `md` breakpoint (current row already uses `flex items-center gap-3` — switch to `flex-wrap`).

No other pages change visually.

## Implementation Steps

1. **Schema migration** — add to `public.general_eligibility`:
   - `service_as_on_mode text not null default 'run_date'` (check in `'run_date','ay_end','custom'`)
   - `service_as_on_date date` (nullable; required only when mode = `custom`, enforced by trigger to keep CHECK immutable per project standards).
2. **Hook (`useGeneralEligibility.ts`)** — extend insert/select payload with the two new fields; bump version on change.
3. **UI (`GeneralEligibility.tsx`)** — add `RadioGroup` + conditional date picker, helper text for resolved AY-end date, wrap layout.
4. **Resolver util (`src/lib/serviceAnchorDate.ts`, new)** — pure function `resolveServiceAnchor({mode, date, assessmentYear, runDate}) → Date`. Single source of truth, reused by edge function and UI preview.
5. **Edge function (`compute-increment`)** — replace `new Date()` used for tenure with `resolveServiceAnchor(...)` from the AY's eligibility row.
6. **Version History line** — render anchor summary.

## Tests
- `serviceAnchorDate.test.ts` — covers all 3 modes, AY parsing, custom-date validation, fallback when row missing.
- `GeneralEligibility` form test — radio toggles enable/disable date picker; invalid custom date blocks Save.
- `compute-increment` regression mock — same employee, same AY, two different anchor dates → different `eligible_months`.

## SSOT updates
- `DOCUMENTATION.md` → General Eligibility section: document the three anchor modes and resolution rules.
- `POLICY.md` → "Minimum Service Evaluation Date" policy entry; default = run date; AY-end recommended for audit determinism.
- New memory: `mem://features/admin/general-eligibility-service-anchor`.

## Post-implementation notes
- Default `run_date` keeps every existing AY row behaving exactly as before — zero-touch upgrade.
- Admins opting into `ay_end` or `custom` get deterministic, replayable eligibility decisions.
