
# Plan — Configurable Selfie Requirement for Assisted Annual Review Submission

Make the live selfie on the "सहायक जमा सत्यापन / Assisted Submission Verification" dialog admin-configurable: **Mandatory** (today's behavior, default) or **Optional** (submitter may skip the photo).

## Risk & Impact Report

- **Data Impact:** `annual_review_proxy_submissions.selfie_path` becomes nullable. Existing rows keep their paths (additive). `app_settings` gets one new boolean column `assisted_selfie_required` (default `true`) — no behavioral change until an admin flips it.
- **Workflow Impact:** None. Same RPC (`submit_annual_review_self_as_proxy`), same audit row, same stage advance. Only difference is the selfie may be absent.
- **UI Impact:** One extra Switch in the existing **AssistedSubmissionSettings** card; the dialog's Capture / Retake / declaration text adapts to the flag.
- **Regression Risk:** Low — the flag defaults to `true` = current behavior. Nullable column is additive.
- **Rollback:** Additive — revert the two edited files + drop the column back to NOT NULL (safe because rows created while feature was off will need to be handled, so prefer leaving nullable).

## Behavior

| Flag | Camera panel | Capture button | Declaration | Submit gate |
|------|--------------|----------------|-------------|-------------|
| `true` (Mandatory, default) | shown, live preview | required | mentions the live photo | `snapshot && accepted` |
| `false` (Optional) | shown, but skippable; if camera unavailable, no error | shown but not required; a **"Skip photo"** action appears | wording drops the photo clause | `accepted` (photo optional) |

If the admin sets Optional, `annual_review_proxy_submissions.selfie_path` is `NULL` for that row and no upload is attempted.

## Scope

### 1. Migration
- Add `app_settings.assisted_selfie_required boolean NOT NULL DEFAULT true`.
- `ALTER TABLE public.annual_review_proxy_submissions ALTER COLUMN selfie_path DROP NOT NULL;`
- No RLS / grant changes needed (existing policies already cover the row/bucket).

### 2. Admin toggle — `src/components/admin/AssistedSubmissionSettings.tsx`
Add a third Switch inside the same card:

```text
[ ] Require live selfie for assisted submissions
    When ON, submitters must capture a live photo of the employee.
    When OFF, the photo becomes optional (declaration alone is accepted).
```

Reads / writes `assisted_selfie_required` alongside the two existing flags via the same `update()` helper.

### 3. Dialog — `src/components/annual-review/AssistedSubmissionDialog.tsx`
- Fetch `assisted_selfie_required` once when the dialog opens (React Query, keyed `['assisted-selfie-required']`, cached).
- When `false`:
  - Camera panel still tries to start (fallback OK) but `streamErr` becomes an inline info line, not blocking.
  - Show an extra **"Skip photo"** ghost button next to Capture.
  - Submit gate: `accepted && !submitting` (drop `!!snapshot`).
  - Declaration + description text swap to a variant without the "live photograph" clause (new i18n keys `assisted.declaration.noPhoto` / `assisted.dialog.desc.noPhoto`).
- When `true`: unchanged from today.

### 4. Service — `src/services/annualReview/proxySubmission.ts`
- Make `selfieBlob` optional in `SubmitWithAssistanceArgs`.
- If absent: skip storage upload; insert audit row with `selfie_path: null`; call RPC as usual.
- If present: existing flow untouched.

### 5. Tests
- `src/test/annualReview/proxySubmissionOptionalSelfie.test.ts`
  - Service: no selfie → no storage call, insert with `selfie_path: null`, RPC still called.
  - Service: with selfie → storage upload + non-null path (regression guard).
- `src/test/annualReview/assistedSelfieFlag.test.ts`
  - Flag `true` → Submit button stays disabled without snapshot.
  - Flag `false` → Skip photo button visible; Submit enables once declaration accepted, even without snapshot.

### 6. Docs
`DOCUMENTATION.md` + `POLICY.md` — record the new toggle, default (Mandatory), and audit note (rows may now have NULL `selfie_path` when the flag is Optional).

## Files

**Migration**
- One `supabase--migration` call (column add + nullable relax).

**Edited**
- `src/components/admin/AssistedSubmissionSettings.tsx`
- `src/components/annual-review/AssistedSubmissionDialog.tsx`
- `src/services/annualReview/proxySubmission.ts`
- `src/lib/annualReview/i18n.ts` (two new keys, EN + HI)
- `DOCUMENTATION.md`, `POLICY.md`, `.lovable/plan.md`

**New**
- `src/test/annualReview/proxySubmissionOptionalSelfie.test.ts`
- `src/test/annualReview/assistedSelfieFlag.test.ts`

## Not Applicable
Pagination, offline resilience (destructive audit path), multi-tenant scoping (global app_setting).
