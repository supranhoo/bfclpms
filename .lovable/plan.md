

# Feature: Centralized File Upload Size Control via System Settings

## What Changes

1. Add a new system setting `max_upload_size_mb` to the database (default: 5 MB).
2. Create a shared constants/hook that all upload components read from.
3. Replace all hardcoded `MAX_FILE_SIZE` values with the centralized setting.
4. Add a UI control in the System Settings admin page to adjust the limit.
5. Fix the branding upload (currently has zero size validation).

## Current State

| Component | Current Limit | Hardcoded? |
|---|---|---|
| MultiFileUpload.tsx | 10 MB | Yes |
| EvidenceUpload.tsx | 10 MB | Yes |
| OrgKpiFileUpload.tsx | 5 MB | Yes |
| importValidation.ts | 10 MB | Yes |
| useAppSettings.ts (branding) | None | Missing |

## Proposed Architecture

All upload components will read from a single source:

```text
system_settings table
  key: "max_upload_size_mb"
  value: 5   (admin-configurable)
       |
       v
useSystemSetting('max_upload_size_mb')
       |
       v
All upload components use this value
```

## Technical Plan

### Step 1: Database Migration

Insert a new row into `system_settings`:

```sql
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('max_upload_size_mb', '5', 'Maximum file upload size in MB for evidence and attachments');
```

No new tables or columns needed.

### Step 2: Create a shared hook — `src/hooks/useUploadLimits.ts`

A small hook that reads the setting and returns the max size in bytes:

- Calls `useSystemSetting('max_upload_size_mb')`
- Parses the value (default 5 MB if missing)
- Returns `{ maxFileSizeMb: number, maxFileSizeBytes: number, isLoading: boolean }`

### Step 3: Update upload components (4 files)

**`src/components/ui/MultiFileUpload.tsx`**
- Remove hardcoded `MAX_FILE_SIZE = 10 * 1024 * 1024`
- Accept `maxFileSizeMb` as a prop (from the hook in the parent) or call the hook directly
- Update validation message to show the dynamic limit
- Update help text from "max 10MB" to dynamic value

**`src/components/ui/EvidenceUpload.tsx`**
- Same changes: remove hardcoded `MAX_FILE_SIZE`, use the shared hook
- Update validation and help text

**`src/components/admin/OrgKpiFileUpload.tsx`**
- Remove hardcoded `5 * 1024 * 1024` check
- Use shared hook for consistent limit

**`src/hooks/useAppSettings.ts` (branding upload)**
- Add file size validation in `useUploadBrandingAsset` using the same limit
- This fixes the current gap where branding uploads have no size check

### Step 4: Update import validation

**`src/lib/importValidation.ts`**
- Keep `IMPORT_LIMITS.MAX_FILE_SIZE_MB` as a separate constant (import files have different needs than evidence uploads)
- Optionally add a second setting `max_import_size_mb` if admin wants to control import sizes too, but this can be a future enhancement

### Step 5: Add UI control in System Settings

**`src/pages/admin/SystemSettings.tsx`**
- Add a new field in the settings form: "Max Upload Size (MB)"
- Number input with min=1, max=50 range
- Uses the existing `useUpdateSystemSetting` mutation to save
- Shown alongside the other system settings (score calculation mode, daily aggregation, etc.)

### Step 6: Update Documentation

**`DOCUMENTATION.md`**
- Document the new system setting
- Note the centralized upload limit behavior

## Files Changed

| File | Change |
|---|---|
| Database migration | Insert `max_upload_size_mb` setting |
| `src/hooks/useUploadLimits.ts` | New file -- shared hook |
| `src/components/ui/MultiFileUpload.tsx` | Use dynamic limit |
| `src/components/ui/EvidenceUpload.tsx` | Use dynamic limit |
| `src/components/admin/OrgKpiFileUpload.tsx` | Use dynamic limit |
| `src/hooks/useAppSettings.ts` | Add size validation to branding upload |
| `src/pages/admin/SystemSettings.tsx` | Add upload size control UI |
| `DOCUMENTATION.md` | Update docs |

## Pros

- **Single source of truth**: Change the limit once, applies everywhere
- **Admin control**: No code deployment needed to adjust limits
- **Fixes branding gap**: Branding uploads currently have zero size validation
- **Backward compatible**: Default of 5 MB is reasonable; existing files are unaffected

## Cons

- **Requires one DB insert**: Minimal migration
- **Setting applies globally**: All upload types share the same limit (except imports). If different limits per context are needed, that would require a more complex settings structure -- but this is likely overkill for now

## Risk

Low. This is purely a validation change on the frontend. No existing files are affected. The default value (5 MB) is more conservative than the current 10 MB, reducing storage costs.

