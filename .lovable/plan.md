## RCA — Why Jyoti (Employee) sees HR PMS + Data Entry groups

### What's actually configured

| Surface | Who decides visibility | What it says for `employee` |
|---|---|---|
| Sidebar — **HR PMS → Review Notes** | Hardcoded `roles` list at `AppSidebar.tsx:79` | ✅ shown (list contains every role incl. `employee`) |
| Page — `/hr/review-notes` | DB setting `system_settings.review_action_notes_visibility` (`useReviewNoteAccess`) | ❌ `view` list is `[admin, hr_pms, manager, skip_level, management, auditor]` — `employee` only has `view_own_subject` |
| Sidebar — **Data Entry → Org KPI Data Entry** | Custom filter (BUG-040/041) — `isDataOwner ‖ user-override ‖ canPerform('data-entry','view')` | ✅ shown — `menu_access_config.data-entry.allowed_roles` includes `employee`, so `canPerform` is true |
| Page — `/admin/org-kpi-data` | `DataOwnerRoute` — same 3-way check | ✅ allowed (same gate) |

DB facts confirmed for Jyoti (`8f08a819…`, role `employee`):
- 0 rows in `org_kpi_data_owners`
- 0 rows in `menu_access_user_overrides`
- 0 rows in `access_profile_assignments`
- BUT `menu_access_config.data-entry.allowed_roles` contains `employee` → `canPerform('data-entry','view')` is `true`.

### Conclusions

1. **Data Entry group — working as configured, not a bug.** An admin gave the `employee` role view rights for `data-entry` in `menu_access_config`. The sidebar correctly shows it, and `DataOwnerRoute` correctly admits her. If you don't want every employee to see Org KPI Data Entry, the fix is **data, not code**: remove `employee` from `menu_access_config.data-entry.allowed_roles` via Admin → Menu Access.

2. **HR PMS → Review Notes — real bug (mismatch).** Sidebar `roles` list is hardcoded and ignores the DB-driven `review_action_notes_visibility` setting that the page uses. Employees (and any role not in the `view` list) see the menu, click it, and get the "no access" error page. This is the menu→deny loop POLICY §111 / BUG-040 explicitly forbids.

---

## Plan — fix only the Review Notes mismatch

### Risk & Impact
- **Data**: none — read-only sidebar filter.
- **Workflow**: HR PMS group hides automatically when its only child hides (`CollapsibleSidebarGroup` returns `null` for empty groups), so employees stop seeing a dead-end menu.
- **UI/UX**: Roles in the DB `view` list (admin, hr_pms, manager, skip_level, management, auditor) keep seeing Review Notes exactly as today. Employees lose the dead menu entry.
- **Regression**: low — change is scoped to one menu item filter.
- **Scalability**: filter is O(1) per render; reuses existing `useReviewNoteAccess` cache.
- **Rollback**: revert the small AppSidebar diff; no DB change.

### Step → Verification

1. **Hook into the existing access source of truth** in `AppSidebar.tsx`:
   - Call `useReviewNoteAccess()` once at the top of `AppSidebar`.
   - Wrap the HR PMS group with a custom `filterByRole` (same pattern as Data Entry, lines 597-614) that, for the `Review Notes` item, requires `canView || canViewOwnSubject`. Other items in the group (e.g. `HR PMS Review`) keep the standard role-list filter.
   - Verification: log in as `employee` with no DB-grant → HR PMS group is hidden. Log in as `hr_pms` / `admin` → Review Notes still visible.

2. **Keep the page-level gate authoritative** — no change to `useReviewNoteAccess` semantics, no change to the DB setting.
   - Verification: `src/test/reviewNotes/access.test.ts` still passes.

3. **New focused test** `src/test/reviewNotes/sidebarVisibility.test.ts` that asserts: with `canView=false && canViewOwnSubject=false` the Review Notes item is filtered out; with either true it remains.
   - Verification: `bunx vitest run src/test/reviewNotes/sidebarVisibility.test.ts`.

4. **Docs**:
   - `DOCUMENTATION.md` — note that HR PMS → Review Notes sidebar visibility is now sourced from `review_action_notes_visibility` (consistent with the page).
   - `POLICY.md` §111 (menu→page parity) — add a one-liner: "Review Notes menu obeys `review_action_notes_visibility.view` ∪ `view_own_subject`."
   - `mem/features/hr/review-action-notes.md` — append a "Sidebar visibility" subsection.
   - `docs/adr/ADR-078.md` — new ADR documenting the mismatch and fix.

### UI Changes
- **What changes visually**: For users whose role is not in `review_action_notes_visibility.view` AND not in `view_own_subject`, the entire **HR PMS** sidebar group disappears (because Review Notes was its only visible item for them). For all other users — no visual change.
- **Exact location**: Left sidebar, "HR PMS" collapsible group.
- **Interaction impact**: Removes a menu entry that leads to an access-denied page. No keyboard/focus regressions.
- **Responsiveness**: No layout change; same `<CollapsibleSidebarGroup>` component on all breakpoints.

### Files
- Edit: `src/components/layout/AppSidebar.tsx` (add `useReviewNoteAccess`; custom filter on HR PMS group).
- Add: `src/test/reviewNotes/sidebarVisibility.test.ts`.
- Add: `docs/adr/ADR-078.md`.
- Edit: `DOCUMENTATION.md`, `POLICY.md`, `mem/features/hr/review-action-notes.md`, `mem/index.md`.

### Out of scope (intentional)
- **Data Entry visibility** — already governed by an admin-editable DB config; if you want employees off it, update `menu_access_config.data-entry.allowed_roles` from the Menu Access admin UI. Say the word and I'll add a one-line migration to drop `employee` from that row.
- The `/hr/review-notes` page text "Ask an admin to grant the 'view' permission" — can be softened to mention `view_own_subject`, but that's a copy-only follow-up.