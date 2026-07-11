## Fixes

### Issue 1 — "Photo upload failed: invalid input syntax for type uuid: photos"
The storage RLS policy on `proxy-selfies` casts the **first** path segment to UUID:
`(regexp_split_to_array(name, '/'))[1]::uuid`.

Our service already builds `${instanceId}/photos/${ts}.${ext}` (instance UUID first). Since the toast still shows `"photos"` as the first segment, the running bundle isn't picking up the fix on the user's browser. To make it bulletproof:

- Add a runtime guard in `submitWithAssistance` that constructs the photo path via a single helper `buildProxyPhotoPath(instanceId, ext)` returning `${instanceId}/photos/${Date.now()}.${ext}`, and asserts the first segment is a UUID before calling `.upload()` (throws a clear developer-facing error otherwise).
- Add a small unit test `src/test/annualReview/proxyPhotoPath.test.ts` that pins:
  - first segment equals `instanceId`
  - second segment equals `"photos"`
  - path passes a UUID regex on `[0]`

No storage policy or migration change is needed — the policy is already correct.

### Issue 2 — Disclaimer checkbox can't be ticked
In `AssistedSubmissionDialog.tsx` the Checkbox is disabled while the required selfie/photo isn't captured yet:

```tsx
<Checkbox
  disabled={(selfieRequired && !snapshot) || (photoUploadRequired && !uploadFile)}
/>
```

That blocks the user from acknowledging the declaration before finishing the media steps, which is confusing UX (they see a "no-entry" cursor on the checkbox).

Fix: **remove the `disabled` prop from the Checkbox** so the user can tick the declaration in any order. The submit button keeps its existing gate (`(selfieRequired && !snapshot) || (photoUploadRequired && !uploadFile) || !accepted || submitting`), so submission still requires all prerequisites.

Update the existing test `proxySubmissionOptionalSelfie.test.ts` (and add one line in `proxySubmission.test.ts`) to assert the Checkbox no longer carries a `disabled=` gate, while the submit button still does.

### Files touched
- `src/services/annualReview/proxySubmission.ts` — extract `buildProxyPhotoPath` + UUID assert
- `src/components/annual-review/AssistedSubmissionDialog.tsx` — drop Checkbox `disabled`
- `src/test/annualReview/proxyPhotoPath.test.ts` — new
- `src/test/annualReview/proxySubmissionOptionalSelfie.test.ts` — extend

### Not touched
- Storage RLS, migrations, admin config, i18n strings, submit-button gating.

After deploy the user should hard-refresh once to drop the cached bundle carrying the old `photos/${instanceId}/...` path.
