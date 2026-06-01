## 1. Assumptions
- Custom fields are an additive layer; built-in fixed fields (Full Name, Employee Code, etc.) stay unchanged in schema/UI.
- Values are stored as JSON keyed by `field_key` per employee — no new physical columns per field.
- Edit User page integration is in scope only if `show_on_edit_user` toggle is on. Employee Master table column rendering is out of scope for this iteration (toggle stored but not rendered) to keep change surgical; we'll note that in the UI.
- Only Admin can manage definitions (RLS via `has_role(auth.uid(),'admin')`); authenticated users may read active definitions and read/write their own values? No — values are written by the create-user flow, so values are admin-managed for now. RLS: read by authenticated, write by admin only.

## 2. Clarifications
None blocking. Reasonable defaults chosen above; will surface "Employee Master table column" toggle as a stored-but-not-yet-rendered preference with a helper note.

## 3. Risk & Impact Report
- **Data Impact**: Two new tables (`employee_master_custom_fields`, `employee_master_custom_field_values`). No alteration to `profiles` or existing fixed-field flow.
- **Workflow Impact**: Add New User gains additional dynamic inputs only when admin enables them. Existing validation and creation paths unchanged.
- **UI/UX Impact**: New `+ Add Field` button + modal in System Settings > General > Employee Master Fields. Custom fields rendered in the same 3-col grid with extra action menu (Edit/Deactivate). On Add New User, custom fields render in a new "Additional Information" section below built-ins.
- **Regression Risk**: Low — built-in fixed fields, validation, and createUser RPC are untouched. New code paths only activate when at least one active custom field exists.
- **Scalability Impact**: Definitions are admin-bounded (dozens at most). Values stored as a single JSONB row per employee — bounded and indexed by `employee_id`.
- **Mitigation Plan**: Strict zod validation of `field_key`, unique constraint in DB, deactivate-not-delete by default, hard-delete requires a typed confirm.
- **Rollback Strategy**: Disable the feature by deactivating all custom fields; tables are additive and can be dropped without affecting profiles.

## 4. Step-by-step Plan

### A. Database (migration)
1. Create `public.employee_master_custom_fields`:
   - `id uuid pk`, `field_key text unique not null` (lowercase, snake_case enforced), `field_label text not null`, `field_type text not null check in ('text','number','date','dropdown','yes_no','email','phone','long_text')`, `is_mandatory boolean default false`, `show_on_add_user boolean default true`, `show_on_edit_user boolean default true`, `show_in_employee_master boolean default false`, `dropdown_options jsonb` (array of `{value,label}`), `placeholder text`, `help_text text`, `is_active boolean default true`, `sort_order integer default 0`, timestamps.
   - GRANTs: read for authenticated, full for service_role.
   - RLS: SELECT for authenticated; INSERT/UPDATE/DELETE only when `has_role(auth.uid(),'admin')`.
2. Create `public.employee_master_custom_field_values`:
   - `id uuid pk`, `employee_id uuid not null references profiles(id) on delete cascade`, `values jsonb not null default '{}'::jsonb`, timestamps, `unique(employee_id)`.
   - Indexes: `(employee_id)`, GIN on `values`.
   - GRANTs: read for authenticated, full for service_role.
   - RLS: SELECT for authenticated (employee directory is already broadly readable in this app); INSERT/UPDATE/DELETE only when `has_role(auth.uid(),'admin')`.
3. Trigger `update_updated_at_column` on both tables.

### B. Domain layer
1. `src/lib/employeeMasterCustomFields.ts`:
   - Types: `CustomFieldType`, `CustomFieldDef`, `CustomFieldValues`.
   - `sanitizeFieldKey(label)` → lowercase snake_case, strips unsafe chars.
   - `zod` schemas: `CustomFieldDefSchema` (with conditional dropdown_options.min(1)) and `validateCustomFieldValues(defs, values)` returning `{ok}|{ok:false, fieldKey, label, message}` mirroring built-in validator. Validates: mandatory, email format, number numeric, dropdown value ∈ options.
2. `src/hooks/useEmployeeMasterCustomFields.ts`:
   - `useCustomFieldDefs({ activeOnly, addUserOnly })` — react-query, sorted by `sort_order, field_label`.
   - `useUpsertCustomFieldDef()`, `useDeactivateCustomFieldDef()`, `useDeleteCustomFieldDef()` (with usage-count check via aggregate query).
   - `useSaveEmployeeCustomFieldValues(employeeId)` — upsert into values table.

### C. Admin UI — System Settings > General > Employee Master Fields
1. Update `EmployeeMasterFieldsCard.tsx`:
   - Header gains a `+ Add Field` button (right-aligned).
   - Below the existing fixed-fields grid, render a second "Custom Fields" 3-col grid with the same card style. Each card shows label, type badge, mandatory `Switch`, and an inline ellipsis menu with Edit / Deactivate (Activate) / Delete.
   - "Delete" uses `ConfirmDestructiveDialog` and warns when stored values exist.
2. New component `EmployeeMasterCustomFieldDialog.tsx` (modal):
   - Inputs per spec; `field_key` auto-derived from label, editable, validated unique (debounced check via query).
   - Conditional dropdown_options editor (add/remove rows, drag-free).
   - `Show on Employee Master table` shown with helper text "Used by employee table column visibility (coming soon)".
   - Save calls upsert; on success, closes and refreshes list.

### D. Add New User integration
1. New component `CustomFieldRenderer.tsx` that switches on `field_type` and renders the correct shadcn input with the `RequiredMark` lowercase red `l` when mandatory.
2. In `src/pages/admin/UserManagement.tsx` Add New User dialog:
   - Local state `customValues: Record<string, unknown>`.
   - Fetch `useCustomFieldDefs({ activeOnly:true, addUserOnly:true })`. If non-empty, render a new section "Additional Information" with the 2-col responsive grid already used elsewhere.
   - In `handleCreateUser`, after built-in validation, run `validateCustomFieldValues(defs, customValues)` and abort with toast on failure.
   - After `createUser.mutate` resolves with new `profile.id`, call `useSaveEmployeeCustomFieldValues` to persist values.
   - `resetCreateForm` clears `customValues`.
3. Edit User dialog is out of scope this iteration (toggle stored only). Add a TODO comment so the next iteration can follow up.

### E. Edge cases / safety
- Reserved keys: refuse `field_key` collisions with any built-in `EmployeeMasterFieldKey`.
- `field_key` regex: `^[a-z][a-z0-9_]{1,40}$`.
- Dropdown without ≥1 option → save disabled.
- Deactivated fields hide from Add New User but are preserved in values JSON.
- Hard delete only after typed confirm; values JSON keys are left intact (orphan-tolerant).

## 5. UI Changes
- **System Settings > General > Employee Master Fields**:
  - Card header: `+ Add Field` button (top-right, `variant="outline"`, `Plus` icon).
  - Existing built-in fields grid unchanged.
  - New "Custom Fields" subsection (`<h4>` + helper text) using identical 3-col grid; each card shows label, small type pill, mandatory `Switch`, ellipsis menu.
- **Modal**: shadcn `Dialog`, max-w-lg, all spec'd inputs, inline zod errors via `text-destructive`, footer Save/Cancel.
- **Add New User dialog**: New "Additional Information" section appears only if active add-user custom fields exist, rendered in the existing 2-col responsive grid pattern. Mandatory custom fields show the red lowercase `l` (no asterisk).

## 6. Implementation
Pending approval; will execute in this order: migration → domain lib + hooks → admin card/modal → Add New User integration → docs/policy update → tests.

## 7. Tests
- `employeeMasterCustomFields.test.ts`:
  - `sanitizeFieldKey` produces safe keys, strips unicode/symbols, collapses spaces.
  - `CustomFieldDefSchema` rejects invalid type, empty dropdown options, reserved keys.
  - `validateCustomFieldValues` enforces mandatory/email/number/dropdown rules; ignores inactive/hidden fields.
- Mock data factory `mockCustomFieldDef(overrides)` for reuse.

## 8. DOCUMENTATION.md updates
- New section under "Admin → System Settings": Employee Master Custom Fields — definitions table, values table, validation rules, RLS posture, dynamic rendering on Add New User.
- Version history entry.

## 9. POLICY.md updates
- Add policy: "Custom Employee Master fields must use deactivate-by-default. Hard delete requires explicit admin confirmation. Field keys are immutable in practice (rename only via deactivate + recreate) to preserve historical values."

## 10. Post-implementation notes
- Will verify: build passes, unit tests pass, and Add New User renders/saves a sample custom field end-to-end.
- Follow-up (not in this iteration): render custom fields on Edit User and as optional columns in Employee Master table.
