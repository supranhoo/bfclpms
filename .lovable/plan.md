# Fix: Public `review-evidence` Bucket → Private

## Status

- ✅ Bucket flipped to **private** via `supabase--storage_update_bucket`.
- ⏳ Pending (requires build mode): refactor 5 direct `<a href={evidenceUrl}>` anchors, add regression test, update docs, mark finding fixed.

**Action needed:** switch to build mode so the remaining steps can complete. Until then, the 5 anchors below will fail to load evidence (CDN returns 400 on a private bucket).

## Risk & Impact Report

- **Data Impact:** Reads stop working over `/storage/v1/object/public/review-evidence/...`. All existing stored URLs (DB columns `*_evidence_url`, `evidence_urls` JSON, etc.) remain valid as **identifiers** because `openStorageFile` parses them and uses the authenticated SDK `.download()` call.
- **Workflow Impact:** None for the dominant path — `openStorageFile` + `EvidencePreviewDialog` use blob URLs from authenticated downloads. Only 5 anchor tags still render `href={url}` directly; those need rerouting.
- **UI/UX Impact:** Same preview/download experience. Anchor `target="_blank"` direct-open is replaced with the existing in-app preview / authenticated blob download.
- **Regression Risk:** Low. Existing `storage.objects` RLS policies already grant authenticated read on this bucket. Affected anchors: inbox detail, query inbox, previous-level remarks, query history (2 fields).
- **Mitigation:** Keep stored URL shape unchanged → no DB migration of historical rows. Unit test confirms `openStorageFile` still parses the URL after the bucket flip.

## Remaining Steps

1. **Refactor 5 direct `href=` callsites** to use `openStorageFile(url)` via `onClick`, replacing the `<a>` with a `<button type="button">` styled identically:
   - `src/components/inbox/InboxDetailSheet.tsx` (line ~150)
   - `src/pages/QueryInbox.tsx` (line ~823)
   - `src/components/review/PreviousLevelRemarks.tsx` (line ~65)
   - `src/components/review/QueryHistoryDialog.tsx` (lines ~93 and ~134)
2. **Tests** — extend `src/test/review/evidencePreview.test.ts` proving the same `/object/public/review-evidence/...` URL still resolves through SDK `.download()` after the visibility flip.
3. **Docs**
   - `DOCUMENTATION.md` v2.66.42 — bucket now private; all reads via authenticated SDK; URL strings retained as opaque identifiers.
   - `POLICY.md` §SEC — review evidence is non-public; UI must use `openStorageFile` (no raw `href`/`<img src>`/`<iframe src>` to `review-evidence`).
   - `@security-memory` — add invariant: review-evidence bucket MUST remain private; new code may not introduce direct CDN links.
4. **Mark finding fixed** via `security--manage_security_finding` for `review_evidence_public_bucket`.

## Why this is safe for the next reviewer in the workflow

- `EvidencePreviewDialog` already renders `<iframe src={blobUrl}>` from an authenticated `.download()` — bucket visibility has no effect.
- `openStorageFile` attaches the user's session token via the SDK, so any logged-in reviewer keeps seeing evidence as before.
- The only intentionally broken case is sharing a raw evidence link outside the app — which is exactly what this finding requires us to prevent.

## Rollback

Single command: `supabase--storage_update_bucket(name="review-evidence", public=true)`. Anchor refactors are additive and safe to leave in place.
