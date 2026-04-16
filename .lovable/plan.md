

## New "Upload Settings" Section in System Settings

### Context
Currently, upload-related settings are scattered: the file size limit lives under "General > File Upload Limit", import validation rules are hardcoded in `importValidation.ts`, and accepted file types are hardcoded per component. This plan consolidates everything into a dedicated **Upload Settings** tab.

### Proposed UI

```text
System Settings Sidebar
┌──────────────────┐
│ Branding         │
│ General          │
│ Scoring          │
│ Cycles           │
│ Controls         │
│ ★ Uploads ★      │  ← NEW section (Upload icon)
│ Report Access    │
│ Menu Access      │
│ Email            │
│ Templates        │
│ Passwords        │
│ Backups          │
│ Data Repair      │
└──────────────────┘
```

### Suggested Settings (Brainstorm)

#### 1. File Size Limits (move from General)
- **Evidence Upload Max Size** — 1–50 MB (currently exists, relocate here)
- **Import File Max Size** — 1–50 MB (currently hardcoded at 10 MB in `IMPORT_LIMITS`)
- **Branding Asset Max Size** — separate limit for logos/wallpapers

#### 2. Allowed File Types
- **Evidence Upload Types** — admin-configurable checklist: PDF, DOC/DOCX, XLS/XLSX, PNG, JPG, JPEG, PPT/PPTX
- **Import File Types** — XLSX, XLS, CSV (toggle CSV support on/off)
- Stored as JSON array in `system_settings`, consumed by upload components

#### 3. Import Column Mapping & Sequence
- **KPI Import Column Order** — drag-and-drop or numbered list to define expected column sequence in upload templates
- **Employee Import Column Order** — same for employee master imports
- **Download Template** button that generates a template matching the configured sequence
- Stored as JSON in `system_settings` (e.g., `kpi_import_column_order`)

#### 4. Mandatory Field Configuration
- **KPI Import Mandatory Fields** — toggle each field as required/optional:
  - Always required (non-configurable): Employee Code, Full Name, Category, KRA, KPI
  - Configurable: Target, UOM, Frequency, Weightage, Criteria, R5-R0 thresholds, Source of Data, Division, Department
- **Employee Import Mandatory Fields** — toggle:
  - Always required: Employee Code, Full Name
  - Configurable: Email, Designation, Division, Department, Manager Code, Role, PMS Grade, Level
- Stored as JSON arrays (`kpi_import_mandatory_fields`, `employee_import_mandatory_fields`)

#### 5. Import Validation Rules
- **Max Rows Per Import** — configurable (currently hardcoded at 10,000)
- **Max String Length** — configurable (currently hardcoded at 1,000)
- **Duplicate Handling** — radio: Skip / Update Existing / Reject File
- **Background Import Threshold** — row count above which import auto-switches to background mode

#### 6. Evidence Upload Rules
- **Max Files Per KPI** — configurable (currently hardcoded at 5 in `MultiFileUpload`)
- **Allow Paste Upload** — toggle Ctrl+V paste functionality on/off
- **Auto-compress Images** — toggle to auto-resize images above a threshold before upload

#### 7. Branding Upload Rules
- **Max Logo Dimensions** — width × height constraints
- **Max Wallpaper Count** — limit number of login wallpapers (currently unlimited)
- **Allowed Image Formats** — PNG, JPG, SVG, WEBP toggles

### Target UI Layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ Upload Settings                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─ File Size Limits ──────────────────────────────────────────┐ │
│ │ Evidence Upload Max Size    [  5 ] MB    (1–50)             │ │
│ │ Import File Max Size        [ 10 ] MB    (1–50)             │ │
│ │ Branding Asset Max Size     [  5 ] MB    (1–20)             │ │
│ │                                          [Save Changes]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ Allowed File Types ────────────────────────────────────────┐ │
│ │ Evidence Uploads:                                           │ │
│ │ ☑ PDF  ☑ DOC/DOCX  ☑ XLS/XLSX  ☑ PNG  ☑ JPG  ☐ PPT/PPTX  │ │
│ │                                                             │ │
│ │ Import Files:                                               │ │
│ │ ☑ XLSX  ☑ XLS  ☐ CSV                                       │ │
│ │                                          [Save Changes]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ Import Validation ─────────────────────────────────────────┐ │
│ │ Max Rows Per Import         [ 10000 ]                       │ │
│ │ Duplicate Handling          ( ) Skip  (•) Update  ( ) Reject│ │
│ │ Background Import Threshold [ 100 ] rows                    │ │
│ │                                          [Save Changes]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ Mandatory Fields ──────────────────────────────────────────┐ │
│ │ ┌─ KPI Import ───────────────────────────────────────────┐  │ │
│ │ │ 🔒 Employee Code  🔒 Full Name  🔒 Category           │  │ │
│ │ │ 🔒 KRA            🔒 KPI                              │  │ │
│ │ │ ☑ Target    ☑ UOM    ☐ Frequency    ☑ Weightage       │  │ │
│ │ │ ☐ Criteria  ☐ R5-R0  ☐ Source of Data                 │  │ │
│ │ │ ☐ Division  ☐ Department  ☐ Business Unit              │  │ │
│ │ └────────────────────────────────────────────────────────┘  │ │
│ │ ┌─ Employee Import ──────────────────────────────────────┐  │ │
│ │ │ 🔒 Employee Code  🔒 Full Name                        │  │ │
│ │ │ ☐ Email     ☑ Designation  ☐ Division                 │  │ │
│ │ │ ☐ Department  ☐ Manager Code  ☐ Role  ☐ PMS Grade     │  │ │
│ │ └────────────────────────────────────────────────────────┘  │ │
│ │                                          [Save Changes]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ Evidence Upload Rules ─────────────────────────────────────┐ │
│ │ Max Files Per KPI           [  5 ]                          │ │
│ │ Allow Paste Upload (Ctrl+V) [ON ]                           │ │
│ │                                          [Save Changes]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ Import Column Sequence ────────────────────────────────────┐ │
│ │ KPI Import Template:                                        │ │
│ │  1. Employee Code  2. Full Name  3. Category  4. KRA       │ │
│ │  5. KPI  6. Target  7. UOM  8. Frequency  ...              │ │
│ │  [Reorder Columns]              [Download Template]         │ │
│ │                                                             │ │
│ │ Employee Import Template:                                   │ │
│ │  1. Employee Code  2. Full Name  3. Email  4. Designation  │ │
│ │  [Reorder Columns]              [Download Template]         │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Technical Changes

**Database** — Insert new `system_settings` keys via migration:
- `evidence_max_size_mb` (default: 5)
- `import_max_size_mb` (default: 10)
- `branding_max_size_mb` (default: 5)
- `evidence_allowed_types` (default: `["pdf","doc","docx","xls","xlsx","png","jpg","jpeg"]`)
- `import_allowed_types` (default: `["xlsx","xls"]`)
- `import_max_rows` (default: 10000)
- `import_duplicate_handling` (default: `"skip"`)
- `import_background_threshold` (default: 100)
- `kpi_import_mandatory_fields` (default: `["target","uom","weightage"]`)
- `employee_import_mandatory_fields` (default: `["designation"]`)
- `evidence_max_files_per_kpi` (default: 5)
- `evidence_allow_paste` (default: true)
- `kpi_import_column_order` (default: current hardcoded order as JSON array)
- `employee_import_column_order` (default: current hardcoded order as JSON array)

**New file: `src/components/admin/UploadSettingsTab.tsx`** — New settings tab component with all cards above.

**File: `src/pages/admin/SystemSettings.tsx`** — Add `{ key: 'uploads', label: 'Uploads', icon: Upload }` to sidebar, move existing upload limit card to new tab, render `<UploadSettingsTab />`.

**File: `src/hooks/useUploadLimits.ts`** — Expand to expose all upload-related settings (types, paste toggle, max files) via a comprehensive hook.

**File: `src/lib/importValidation.ts`** — Replace hardcoded `IMPORT_LIMITS` with values from `useUploadLimits` (pass as params to validation functions).

**Consumer files** — Update `EvidenceUpload.tsx`, `MultiFileUpload.tsx`, `OrgKpiFileUpload.tsx`, `ImportData.tsx`, `OrgStructureImport.tsx`, `GlobalBrandingSettings.tsx` to read settings from the hook instead of hardcoded values.

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump.

### Risk Assessment
- **Data impact**: Additive INSERT of new `system_settings` rows only; existing `max_upload_size_mb` row remains (aliased to `evidence_max_size_mb`)
- **Regression risk**: Low — all hardcoded defaults match current behavior; settings are opt-in overrides
- **UX improvement**: Centralized upload governance; admins no longer need developer changes for file type or limit adjustments

