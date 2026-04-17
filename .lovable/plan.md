
## Add "Location" Field to Employee Master Import Template

### Context (verified from codebase)
- `src/lib/importValidation.ts` → `EmployeeImportRowSchema` does not include `location`.
- The recently-added `EmployeeMasterBackfill` flow already resolves `location` against a master, so the master-import path is the only remaining gap.
- The downloadable template (XLSX) is generated in the Employee Import page (`src/pages/admin/ImportData.tsx` or its template helper).

### Change
1. **Template (XLSX header)** — add a `Location` column to the downloaded employee-master template, placed next to `Business Unit` / `Department` for grouping consistency.
2. **Schema** — extend `EmployeeImportRowSchema` in `src/lib/importValidation.ts` with `location: z.string().max(100).optional()`.
3. **Header normalization** — add `'Location' → location` mapping wherever the importer maps XLSX headers to row fields (Employee Master parser in `ImportData.tsx`).
4. **Resolution logic** — in the employee insert/update path (`supabase/functions/create-employee/index.ts` and the bulk import flow), resolve `location` against the `locations` master by normalized name (`upper(trim(...))`) → `location_id`.
   - **Soft-resolve rule** (per existing import policy): if the value is provided but no master match, insert with `location_id = NULL` and surface a warning row in the Import Summary dialog. Never hard-reject.
5. **Backfill tool parity** — confirm `EmployeeMasterBackfill` already handles `Location`; no change needed there (already in scope from the earlier plan).

### Risk & Impact
| Area | Impact |
|---|---|
| Data | Additive only. Existing imports without the column continue to work (field is optional). |
| Workflow | None. Employee creation/update flow unchanged for rows that omit Location. |
| UI/UX | New column appears in the downloaded template + in import preview/summary. |
| Regression | Very low. Field is optional and soft-resolved. |
| Mitigation | Vitest case: row with `location='Mumbai'` → resolves to id; row with `location='UnknownTown'` → inserts with NULL + warning; row with no `location` → unchanged. |

### Files Touched
- `src/lib/importValidation.ts` (schema + header map)
- `src/pages/admin/ImportData.tsx` (template generator + parser header map + summary surfacing)
- `supabase/functions/create-employee/index.ts` (location lookup + soft-resolve)
- `src/lib/importValidation.test.ts` (new cases)
- `DOCUMENTATION.md` Version History + `POLICY.md` Import Governance + `mem://architecture/data-import-engine`

### Out of Scope
- Making Location mandatory (kept optional; can be toggled later via `import_field_settings.is_mandatory`).
- Reworking the `locations` master UI (already exists).
- Changes to PMS/Org-structure import paths.
