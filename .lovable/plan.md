

## Upgrade Admin Data Entry to Multi-File Attachments

### Problem
The admin data entry dialog currently uses the single-file `EvidenceUpload` component, but the platform already supports multi-file evidence uploads (up to 5 files) via the `MultiFileUpload` component used elsewhere. Admin should have the same capability.

### Changes

#### File: `src/components/admin/AdminDataEntryDialog.tsx`

1. **Replace `EvidenceUpload` import with `MultiFileUpload`** — swap the import from `@/components/ui/EvidenceUpload` to `@/components/ui/MultiFileUpload`.

2. **Change state from single URL to URL array** — replace `evidenceUrl: string | null` with `evidenceUrls: string[]`. Update all references (reset, load from existing submission, pass to submit).

3. **Load existing multi-file URLs on role change** — in the `useEffect` that loads existing submission data, read `{role}_evidence_urls` (JSONB array) instead of `{role}_evidence_url`. Fall back to wrapping the legacy single URL in an array if the JSONB field is empty.

4. **Replace `<EvidenceUpload>` with `<MultiFileUpload>`** — in the JSX (around line 811-818), render `MultiFileUpload` with props: `userId={employeeId}`, `contextId={kpi.id}`, `folder={roleLevel}`, `existingUrls={evidenceUrls}`, `onUploadComplete={setEvidenceUrls}`.

5. **Pass URLs array to submit** — update the submit handler to pass `evidence_urls` (the array) in addition to `evidence_url` (last URL for backward compatibility).

#### File: `src/hooks/useAdminDataEntry.ts`

1. **Add `evidence_urls` to `AdminDataEntryParams`** — add optional `evidence_urls?: string[] | null` field.

2. **Update `buildUpdateFields`** — when `evidence_urls` is provided, set `{role}_evidence_urls` field and sync `{role}_evidence_url` to the last URL in the array (backward compatibility with legacy single-URL column).

### No database changes needed
All `*_evidence_urls` JSONB columns already exist on `review_submissions`.

