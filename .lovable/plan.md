# Employee Master — column visibility & upload completeness

## Confirmation of the two reported gaps

Both are real. Verified in code:

**Gap 1 — Employee Master grid shows only 10 of ~25 attributes.**
`src/pages/admin/UserManagement.tsx` renders a fixed header set: User, Employee Code,
Department, Designation, PMS Grade, Mobile, Role, Status, Reporting To, Actions.
Not shown anywhere in the list: **Functional Manager (F1)**, Company, Division,
Business Unit, Location, Employee Category, Employment Status, GDOJ / DOJ /
Confirmation Date, Portal Access, Dummy-employee flag, and every admin-defined
**custom field** (those exist in the Add/Edit dialogs only).

**Gap 2 — Upload/template/export do not carry every master column.**
The importer (`src/pages/admin/ImportData.tsx`) already handles Functional Manager,
category, employment status, location, GDOJ/DOJ/confirmation, portal access.
Genuinely missing:
- `mobileNumber` — not parsed, not written, not in template, not in export.
- `isDummyEmployee` — not parsed, not written, not in template, not in export.
- Custom fields — no import/export path at all.
- Export omits `portalAccess`, so a round-trip (Export → edit → Import) silently
  loses it.
- The on-screen column documentation omits `companyCode`, `employeeStatus`,
  `mobileNumber` even though two of them are supported — users cannot know they exist.

## Risk & impact

- Data: no schema change. `mobile_number`, `is_dummy_employee` and the custom-field
  value table already exist; only read/write paths widen.
- Workflow: none. These attributes are descriptive; scoring/workflow untouched.
- UI: grid gains a column chooser; default visible set stays as today, so no
  layout shock. Import panel gains rows in the documentation list.
- Regression risk: importer row-mapping is the sensitive area (a shifted column
  broke an export before). Mitigated by explicit key-based mapping plus tests.
- Scalability: grid already paginates server-side; extra columns come from data
  already fetched or from one extra batched lookup for custom-field values.
- Rollback: purely additive — revert the component/lib changes.

## Plan

### A. Employee Master grid column visibility
1. Add `src/lib/employeeMasterColumns.ts` — SSOT list of grid columns (key, label,
   default-visible, value resolver source) built from `EMPLOYEE_MASTER_FIELDS` plus
   the active custom-field definitions. No hardcoded label lists in the page.
2. Add a "Columns" chooser (dropdown with checkboxes) to the User Management toolbar;
   selection persisted per-user in localStorage.
3. Render chosen columns in the table, including Functional Manager (F1), Company,
   Division, BU, Location, Category, Employment Status, GDOJ/DOJ/Confirmation,
   Portal Access, Dummy flag, and custom fields flagged `show_in_employee_master`.
4. Ensure the roster query projects the added columns (extend the slim select /
   hydration list, honouring the existing paging helpers).

### B. Upload / template / export completeness
5. Importer: parse `mobileNumber` (aliases mobile, phone, contactNumber) and
   `isDummyEmployee` (Yes/No), validate mobile format, and write both on create and
   update paths.
6. Importer: accept custom-field columns by `field_key` header, validate against the
   field definition (type, mandatory, dropdown options), and upsert into the
   custom-field values table.
7. Template download: add `mobileNumber`, `isDummyEmployee`, and one sample column per
   active custom field, so the template is always complete by construction.
8. Export Current Data: add `portalAccess`, `mobileNumber`, `isDummyEmployee` and the
   custom-field columns, with headers matching importer aliases for clean round-trip.
9. Rewrite the "Required / Optional columns" help block to render from the same SSOT
   list, so the documentation can never drift from what the parser accepts.

### C. Tests, docs, policy
10. Unit tests: column SSOT completeness (every master field is either default-visible
    or selectable), importer parses new aliases, export/import round-trip header parity,
    custom-field validation happy + failure paths.
11. `DOCUMENTATION.md`: new ADR-247 (Employee Master column parity) + section update.
12. `POLICY.md`: new §EMP-MASTER-COLUMN-PARITY — every Employee Master attribute must be
    selectable in the grid, present in the template, importable and exportable; adding a
    master field requires updating the single SSOT list only.

## UI changes
- User Management toolbar: new "Columns" button (checkbox dropdown, search box for long
  lists). Table gains horizontal scroll when many columns are chosen; sticky first column.
- Import Employees panel: longer documented column list, grouped Required / Optional /
  Custom fields.
- No changes to any review, scoring or dashboard surface.
