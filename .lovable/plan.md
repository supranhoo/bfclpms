## Root cause

The Organization page renders 11 tabs (Divisions, Business Units, Org Heads, Departments, Sub-Branches, Locations, Designations, PMS Grades, Levels, Employee Categories, Employment Statuses) inside the shared `TabsList`, which is locked to `h-10` with `p-1 bg-muted/60 rounded-lg` (`src/components/ui/tabs.tsx:15`).

`OrgTabsList` adds `flex-wrap` (`src/pages/admin/Organization.tsx:1102`) so the chips wrap onto a second row, but the container's fixed `h-10` clips them — producing the misaligned second row, the floating "Divisions (7)" active pill, and the off-baseline second-row chips visible in the screenshot.

## Fix (UI only, scoped)

`src/pages/admin/Organization.tsx` — `OrgTabsList`:
- Replace `flex-wrap` with `h-auto flex flex-wrap gap-1 justify-start` to let the row container grow with content and space chips evenly.
- Active state stays unchanged (still uses the shared `TabsTrigger` styles), so the "Divisions (7)" pill aligns inside its own chip on whichever row it lands.
- No change to `src/components/ui/tabs.tsx` (would affect every TabsList in the app — out of scope).

Optional polish (kept inside the same component, no new deps): on `md+` screens where horizontal space exists but the chips still wrap, switch to a single-row scrollable strip using `md:flex-nowrap md:overflow-x-auto md:gap-1` — prevents the wrap entirely on wide viewports. Mobile/narrow stays wrapped.

## Risk & Impact

- **Data Impact:** None.
- **Workflow:** None — pure visual.
- **UI/UX:** Tabs become a clean two-row chip grid on narrow widths and a single scrollable strip on `md+`. Active chip aligns to its row. No other TabsList in the app is touched.
- **Regression Risk:** Very low — change is contained to `OrgTabsList`.
- **Scalability:** Works as more tabs are added.

## Tests

`src/test/orgTabsListLayout.test.tsx` (RTL):
- Renders `OrgTabsList`, asserts the list root has `flex-wrap` and `h-auto` (not the default `h-10`).
- Asserts all 11 tab labels are visible (none clipped from the DOM).

## DOCUMENTATION.md / POLICY.md

- DOCUMENTATION.md → small note under "Organization Structure" page: tabs use a wrap-aware chip layout that scales beyond the default TabsList height.
- POLICY.md → Not Applicable.
