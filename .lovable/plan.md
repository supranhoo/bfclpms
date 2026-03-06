

# Fix: Add Deadline Days Input for "Self Review Deadline Passed" Rule

## Problem

The "Self Review Deadline Passed" auto-lock rule is non-functional. The edge function requires a `deadline_days` value in `trigger_condition`, but the UI only saves `{ description: "..." }` — no days value. The rule will always be skipped.

## Solution

Update `src/components/admin/ReviewPeriodAutoRules.tsx` to:

1. **Add a deadline days input** — When `deadline_passed` rule type is selected (or for existing rules of that type), show a number input for specifying the number of days after which the self-review stage should auto-lock.

2. **Save `deadline_days` in `trigger_condition`** — When creating or editing a `deadline_passed` rule, include `{ description: "...", deadline_days: N }` in the `trigger_condition` JSON.

3. **Display deadline days in the table** — Show the configured days in the Description column (e.g., "Lock self-review after 14 days").

4. **Allow inline editing** — Add an editable number field in the table row for `deadline_passed` rules so admins can update the deadline without recreating the rule.

## File Modified

- `src/components/admin/ReviewPeriodAutoRules.tsx` — Add number input for deadline days in the add-rule flow and display/edit it in the rules table

## No database or edge function changes needed

The edge function already handles `deadline_days` correctly — only the UI is missing the input.

