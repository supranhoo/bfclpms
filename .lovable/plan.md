# Target must not exist for Binary and Tiered KPIs

## The gap (verified in code and data)

The rule "only a value-based (Numeric) KPI has a Target" is enforced in exactly one place and ignored everywhere else.

Enforced today:
- `AdminKpiEditorForm` and `AdminKpiCreateDialog` hide the Target input for Binary/Tiered and write `target_value` as `null` unless the type is `numeric`.

Not enforced today:
- **Performance Console → Edit definition for the whole group** (the dialog in the screenshot). The Target input renders unconditionally, and the change set sends `target_value` for every type. The same dialog already does the right thing for the R0–R5 ladder and the unit (`ladderForType` blanks them for non-numeric) — Target was simply left out of that rule.
- **Row override dialog** (per-employee tuning) — Target is always offered.
- **KPI detail drawer → bulk tuning** — a bulk "Target" box writes `target_value` to selected rows with no type check.
- **Review screens** — the Metrics card and the KPI details table print "Target: 15" for Binary/Tiered rows whenever a stale value exists, and the KRA export carries the same column.
- **Server side** — the console change validator does not reject `target_value` on a non-numeric type, so any caller can persist it.

Residue already in the database (`kpis`):

| Type | Rows | Rows carrying a target |
|---|---|---|
| numeric | 16,359 | 16,329 |
| binary | 3,411 | 493 |
| tiered | 576 | 35 |

528 non-numeric rows hold a target that no scoring path uses. Scoring for Binary/Tiered comes from `qualitative_options`, so these values never affect a score — they are display-only noise that makes the console and the scorecard contradict the Admin KPI Editor.

## Fix

**1. One shared rule, not three copies.**
Add a single helper (next to the existing `ladderForType` in `groupEditModel.ts`) that answers "does this UOM type own a target?" — true only for `numeric`. Every editor imports it; no component re-implements the check.

**2. Group definition edit dialog.**
- Hide the Target field when the type is Binary or Tiered, exactly as the unit and R0–R5 ladder already hide.
- Extend the ladder-clearing rule so `target_value` travels as a clear (empty) value when the admin switches a KPI from Numeric to Binary/Tiered, and never travels at all while the type stays non-numeric.
- Switching type to Binary/Tiered therefore shows "Target will be cleared" in the preview alongside the existing unit/ladder clears, so the admin sees it before applying.

**3. Row override dialog and drawer bulk tuning.**
Drop the Target control for non-numeric KPIs in both surfaces (the drawer already knows the group's type via `resolveKpiScoringModel`). For a mixed-type group, keep the control but label it as applying to numeric rows only, and skip non-numeric rows in the run.

**4. Review and report surfaces.**
Suppress the Target metric on the KPI metrics card, the KPI details table and the KRA export when the type is Binary/Tiered — those screens already switch the rating scale to "Option Mapping" for these types, so the Target line is the last inconsistency left. The export column stays for numeric rows and is blank for the others.

**5. Server guard (the real stop).**
Reject or silently drop `target_value` for non-numeric rows inside the console change validator and the row-override write path, so a stale client, a script or a future surface cannot reintroduce it. This is the invariant; the UI changes are the courtesy.

**6. Carry the rule through rollover and copy paths.**
Rollover, template propagation, Copy KRAs and KPI import all clone `target_value` verbatim. Each gets the same type check so a cleaned month cannot be re-polluted next month.

**7. Clean the existing residue — forward-only.**
A one-off migration nulls `target_value` on Binary/Tiered rows from **May 2026 onward** (the standing forward-only correction floor), writing every touched row to an audit archive table so the change is reversible. Rows before May 2026 stay untouched: historical data is frozen, and since the value never entered a score, leaving it costs nothing.

**8. Regression cover.**
Tests asserting: the target helper returns false for binary/tiered; the group edit change set never emits a target for a non-numeric type and does emit a clear on type change; the bulk and override paths skip non-numeric rows; the review card renders no Target line for a tiered KPI; and the rollover clone drops the target.

## Technical notes

- Shared predicate lives with the existing scoring helpers so the console, the admin editor and the review renderer share one source of truth.
- Server changes touch `public.bu_console_validate_changes` and the row-override write function only — no schema change, no new column.
- The cleanup migration is data-only, audited and reversible from the archive table; the guard changes are pure function-body replacements, rolled back by redeploying the prior bodies.
- `POLICY.md` gains a rule under the KPI definition section: target is a property of value-based KPIs only, and every write path must enforce it. `DOCUMENTATION.md` gets the corresponding ADR entry.

## Decision needed

The cleanup in step 7 is scoped to May 2026 onward. Say the word if you want the earlier months (Sep 2025 – Apr 2026, ~436 binary rows) cleaned too — that requires an explicit exception to the freeze.
