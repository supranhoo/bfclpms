
# Move Assisted-Submission Verification to End of Form

## Goal
Proxy users (Manager / HR PMS / Admin submitting on behalf of a non-login employee) should be able to **fill the annual review form first** and only be prompted for the **live selfie + signed declaration at final submission time**, instead of being blocked by the selfie dialog the moment the form opens.

## Assumptions
- Current behavior: opening a non-login employee from the directory sets `?assisted=1`, which causes `TeamReviewDetailContent` to auto-open `AssistedSubmissionDialog` immediately. The dialog currently owns the entire proxy flow (selfie → declaration → RPC `submit_annual_review_self_as_proxy`).
- The self-stage form itself already exists and is rendered by the standard review UI; today in proxy mode it is hidden behind the dialog.
- The eligibility RPC (`can_proxy_submit_annual_review`) and the audit table remain the source of truth — no schema or RPC changes.
- Selfie storage bucket `proxy-selfies`, audit table `annual_review_proxy_submissions`, and the "no file picker" rule remain untouched.

## Risk & Impact Report

**Data Impact:** None. Same tables, same RPC, same bucket, same audit row shape.

**Workflow Impact:** Proxy user now edits the self-review scorecard/inputs *before* attestation. Attestation is still mandatory before the stage advances — the RPC call order is unchanged (audit insert → `submit_annual_review_self_as_proxy`). The stage cannot transition without a valid selfie + declaration.

**UI/UX Impact:**
- Directory → employee opens the standard self-review form (not the selfie dialog).
- A persistent **"Submitted with assistance"** banner appears at the top of the form indicating proxy mode is active, who the proxy is, and that a selfie + declaration will be required at submit.
- The normal "Submit" button is replaced (in proxy mode only) with **"Verify & Submit with assistance"**, which opens the existing `AssistedSubmissionDialog`.
- Dialog contents unchanged (webcam capture, declaration checkbox, submit button gated on both).

**Regression Risk:**
- Native self-submitters (employees with login) must be unaffected — proxy mode only activates when `useProxyEligibility` returns true AND no native stage role applies (existing guard).
- Auto-open param `?assisted=1` currently used by the directory must be neutralized so old links don't force the dialog open on mount.
- The proxy submit button must be disabled if the form has unsaved required fields, matching the native submit gating.

**Mitigation Plan:**
- Keep the eligibility gate and RPC path exactly as-is; only the *trigger point* of the dialog moves.
- Add unit tests asserting: (a) dialog does NOT auto-open on mount in proxy mode, (b) proxy submit button is visible only when eligible, (c) native path is untouched.
- Preserve backward compatibility of the `?assisted=1` query param by ignoring it (no redirect needed) — it becomes a no-op.

## Scope of Changes

### 1. `src/pages/annual-review/TeamAnnualReview.tsx`
- Stop appending `?assisted=1` when navigating from the directory. Just navigate to the detail page; proxy mode will be inferred from eligibility inside the detail view.

### 2. `src/pages/annual-review/TeamAnnualReviewDetail.tsx`
- Stop reading `?assisted=1` and stop passing `autoOpenAssisted` to `TeamReviewDetailContent`. (Keep the prop for now defaulting to `false` to avoid a wider refactor, or remove it if unused elsewhere — will confirm during build.)

### 3. `src/components/annual-review/TeamReviewDetailContent.tsx` (proxy branch)
- Remove the `useEffect` that opens `AssistedSubmissionDialog` on mount when `autoOpenAssisted` is true.
- When `proxyEligible === true` and `!stageRole` and `instance.overall_status === 'pending_self'`:
  - Render the **standard self-review form** (same component the employee would see).
  - Render a top **proxy banner** ("You are submitting on behalf of {employee}. A live selfie and signed declaration will be required to submit.").
  - Replace the native submit affordance with a **"Verify & Submit with assistance"** button that opens `AssistedSubmissionDialog`.
- Everything the form captures (scores, remarks, evidence) is saved via the existing draft/save path exactly like native self-review — no new persistence layer.

### 4. `src/components/annual-review/AssistedSubmissionDialog.tsx`
- No behavior change to selfie capture, declaration checkbox, or the submit RPC call.
- Continue to call `submitWithAssistance(...)` which advances the stage. The form data is already persisted before the dialog opens, so the RPC just needs to flip the stage — same contract as today.
- Minor copy tweak: "Capture selfie to complete submission" instead of "…to begin".

### 5. Tests (`src/test/annualReview/proxySubmission.test.ts` + new cases)
- Update the existing assertion that expects `AssistedSubmissionDialog` to auto-open — replace with an assertion that it does NOT auto-open.
- Add: "proxy banner + Verify & Submit button render when eligible at pending_self".
- Add: "clicking Verify & Submit opens the dialog"; "dialog still gates on snapshot + accepted + submitting" (existing check retained).
- Add: "native self-submitter path unaffected — no proxy banner, no Verify & Submit button".

## Out of Scope
- No changes to `can_proxy_submit_annual_review`, `submit_annual_review_self_as_proxy`, `annual_review_proxy_submissions` schema/policies, or the selfie bucket.
- No changes to who can proxy (Manager / Skip / HR PMS / Admin / designated proxy) or eligibility rules.
- No changes to the audit trail shape or visibility badges.
- No changes to native (login) self-review UX.

## Rollback
Pure frontend change. Revert the four files listed above to restore the entry-gate behavior. No data migration.

## Documentation & Policy Updates
- Update `mem/features/annual-review/assisted-submission` "Verification" section: selfie is captured at **final submit**, not at form entry; form data persists via the standard self-review draft path.
- Add a note under "Code map" reflecting the new submit-time trigger in `TeamReviewDetailContent` (instead of auto-open in the detail page).
- Add an ADR entry (next available ADR-106) noting the UX change and the reason (proxy users need to complete the form before attesting).

## Verification Steps
1. Open Manager → Annual Review Team → All Employees → search a non-login employee → open form → **selfie dialog must NOT appear**; form is editable; proxy banner visible.
2. Fill the form → click **Verify & Submit with assistance** → dialog opens → capture selfie → check declaration → submit → stage advances to next; audit row written with the captured selfie path.
3. Open a login-capable employee via native path → no proxy banner, standard submit button, no behavior change.
4. Unit tests pass (updated + new).
