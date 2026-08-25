# Plan: Fix KPI library duplicate-merge UI width and horizontal scrolling

## Assumptions
- Target is the **KPI library & duplicates** dialog opened from **Admin → Performance Console → more tools → KPI library & duplicates**.
- The uploaded screenshot shows the duplicate merge queue inside that dialog.
- This is a presentation-only change: no scoring, merge-decision logic, RPCs, permissions, or historical KPI data will change.

## Clarifications
Not Applicable.

## Risk & Impact Report
- **Data Impact:** None. No schema, RLS, grants, or historical records are changed.
- **Workflow Impact:** None. Existing scan, select, approve, reject, pagination, and read-only permission behavior remain unchanged.
- **UI/UX Impact:** Positive. The dialog will use more viewport width and prevent left-to-right scrolling by constraining long KPI text inside rows.
- **Regression Risk:** Low. Risk is limited to the KPI library dialog layout.
- **Scalability Impact:** No data-loading change. Existing server pagination remains unchanged; rendering stays limited to the current page of proposals.
- **Mitigation Plan:** Keep the change scoped to layout classes/component structure, add/update a layout regression test for horizontal overflow, and document the presentation decision.
- **Rollback Strategy:** Revert the presentation edits to the dialog wrapper and duplicate-merge tab; no database rollback required.

## Step-by-step Plan
1. **Enlarge the dialog shell**
   - Update the Performance Console library dialog from a narrow scrollable modal to a viewport-contained wide surface.
   - Use a flex column layout with fixed header and a single internal vertical scroll body.
   - Explicitly prevent horizontal overflow at the dialog level.

2. **Remove nested width pressure inside the merge queue**
   - Adjust `MergeProposalsTab` so its root surface can fit inside the dialog without adding its own wide card constraints.
   - Add `min-w-0`, `overflow-hidden`, and wrapping/truncation rules to group headers and proposal rows.
   - Ensure long KPI names wrap or clamp instead of pushing the modal wider.

3. **Improve responsive behavior**
   - Desktop: use the wider modal for comfortable review of groups and action controls.
   - Tablet/mobile: keep controls stacked and text contained, with vertical scrolling only.
   - Keep buttons reachable without creating a horizontal scrollbar.

4. **Regression guard**
   - Add/update the relevant console layout test to assert the duplicate-merge UI uses overflow-safe classes and does not depend on horizontal scrolling.

5. **Documentation and policy sync**
   - Add an ADR note documenting the presentation-only layout fix.
   - Update `DOCUMENTATION.md` and `POLICY.md` to record that duplicate KPI review workbenches must be wide, viewport-contained, and vertically scrollable only.

## UI Changes
- **Location:** Admin → Performance Console → KPI library & duplicates dialog.
- **Visual change:** The dialog becomes wider and more page-like, with less cramped content.
- **Scrolling change:** Horizontal scrolling is removed; only vertical scrolling remains when content is long.
- **Text behavior:** Very long KPI names will wrap/clamp inside their row instead of expanding the dialog.
- **Interaction impact:** Existing buttons and bulk-selection actions remain in the same workflow.

## Implementation
- Update only presentation code for:
  - `src/pages/admin/BuConsole.tsx`
  - `src/components/admin/bu-console/MergeProposalsTab.tsx`
- Add/update a focused layout test if an existing test file covers this component.
- Update documentation/policy files required by project standards.

## Tests
- Run the focused BU console layout test after implementation.
- Verify the duplicate-merge dialog in the browser at the current viewport and confirm there is no left-to-right scrollbar.

## DOCUMENTATION.md updates
- Record the wider, overflow-safe duplicate KPI workbench layout and its intended behavior.

## POLICY.md updates
- Record that bulk duplicate-review UI must be paginated, viewport-contained, and must not require horizontal scrolling for review decisions.

## Post-implementation notes
- No backend migration is expected.
- No merge decisions will be changed by this UI fix.
