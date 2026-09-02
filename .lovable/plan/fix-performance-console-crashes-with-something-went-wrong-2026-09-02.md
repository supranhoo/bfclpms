# Fix: Performance Console crashes with "Something went wrong"

## Cause (verified in a live browser run)

Loading `/admin/bu-console` throws `targetForType is not defined` twice, and the error boundary swaps the page for the "Something went wrong" card.

`GroupDefinitionEditDialog.tsx` calls `targetForType(...)` at line 327 (added in the ADR-341 target-visibility work), but the function was never added to its import from `./groupEditModel` on lines 49-52. The helper exists and is exported — only the import line is missing. Because the dialog is rendered as part of the console page, the whole page dies on render, not just the dialog.

## Fix

1. Add `targetForType` to the existing `./groupEditModel` import in `GroupDefinitionEditDialog.tsx`. One line; no logic change.
2. Reload `/admin/bu-console` in a browser session and confirm the tree renders and no page error is logged.
3. Open the "Edit definition for the whole group" dialog on a numeric KPI and on a tiered KPI, confirming the Target field shows for numeric and is hidden (and cleared in the change set) for tiered — the ADR-341 behaviour this change was meant to deliver.

## Preventing the repeat

The build passed and the type check passed because the file uses this symbol in a way TypeScript's config did not flag, so only a render caught it. To close that gap:

- Add a smoke test that renders the console page shell (or at minimum imports every `bu-console` module) so a missing binding fails in CI instead of in the user's browser.
- Note in DOCUMENTATION.md (ADR-341 follow-up) that console surfaces must be exercised by a render test after shared-helper extractions.

## Risk

- Data: none.
- Workflow: none.
- Regression: negligible — restoring a missing import.
- Rollback: revert the one-line import.
