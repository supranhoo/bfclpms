

## Add Evidence Upload to Admin Data Entry Dialog

### Problem
The Admin Data Entry dialog (screenshot) has no file attachment option. Unlike other review interfaces (SelfReviewSheet, Query dialogs, Org KPI Entry), the admin override form only has text fields for Remarks and Reason — no way to upload supporting evidence.

### Fix
Add the `EvidenceUpload` component to `AdminDataEntryDialog.tsx`, placed between the Remarks textarea and the "Advance workflow status" toggle. Wire the uploaded URL into the submission payload via the existing `evidence_url` field on `review_submissions`.

### Changes

**`src/components/admin/AdminDataEntryDialog.tsx`**:
1. Import `EvidenceUpload` from `@/components/ui/EvidenceUpload`
2. Add `evidenceUrl` state variable
3. Place `<EvidenceUpload>` after the Remarks field, passing `userId={kpi.user_id}`, `kpiId={kpi.id}`, and `existingUrl` from the loaded submission
4. Include `evidence_url: evidenceUrl` in both `handleSubmit` and `handleFastTrack` payloads
5. Reset `evidenceUrl` when the dialog opens/closes

**`src/hooks/useAdminDataEntry.ts`** (if needed):
- Ensure the mutation accepts and saves `evidence_url` to the `review_submissions` upsert

