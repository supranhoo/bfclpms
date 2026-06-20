
## Goal
Allow Reporting Manager, HR PMS, Skip-Level/Admin, or an explicitly designated proxy to submit the **self-stage** of the Annual Review on behalf of blue-collar / non-login employees, gated by a **mandatory live webcam selfie of the employee** and a full audit trail.

## Scope (what changes)
Only the Annual Review **self-stage** submission flow. Manager/Skip/HR stages are untouched. All other modules untouched.

## Risk & Impact Report
- **Data Impact**: Adds 1 new table (`annual_review_proxy_submissions`), 2 columns on `annual_review_instances` (`submitted_via_proxy boolean`, `proxy_submission_id uuid`), 1 new private storage bucket (`proxy-selfies`). No existing data mutated.
- **Workflow Impact**: Self-stage submission gains an optional "Assisted submission" path. Default behavior unchanged for self-login users.
- **UI Impact**: New `AssistedSubmissionDialog` on `EmployeeAnnualReview` page; new "Assisted by" badge on `InstanceTimeline` / status row; HR-only selfie viewer in `HrFinalizationSheet` / admin instance detail.
- **Regression Risk**: Low — gated by eligibility check + feature flag (`assisted_self_submission_enabled` in `app_settings`). Existing self-submit path is unmodified when proxy is not used.
- **Mitigation**: Feature flag, RLS on selfie bucket (HR/Admin/RM/Skip only), unit tests, immutable audit row, action disabled when employee has logged in ≥1 time.

## Policy Decisions (from clarifying answers)
1. **Proxy roles**: Reporting Manager, HR PMS, Skip-Level, Admin. Plus a per-employee "designated proxy" override stored on the employee profile.
2. **Eligibility**: Auto-detected — employee profile has no email **or** has never logged in (`auth.users.last_sign_in_at IS NULL`). Tracked via SECURITY DEFINER RPC.
3. **Verification**: Single mandatory **live webcam selfie of the employee** (gallery upload blocked, `capture="user"` + `getUserMedia`), captured at submission time. Stored privately with timestamp metadata.
4. **Visibility**:
   - Public badge: *"Submitted with assistance by {Proxy Name} ({Role})"* on timeline, scorecard, and exports.
   - Selfie visible **only** to Reporting Manager, Skip-Level Manager, HR PMS, Admin (RLS-enforced).
   - Immutable audit row: proxy `user_id`, employee `user_id`, instance id, timestamp, selfie storage path, captured IP/user-agent.
   - Once employee logs in even once, proxy path auto-disables for them.

## Implementation Plan

### Step 1 — DB migration
- Add `app_settings.assisted_self_submission_enabled boolean default false`.
- Add `profiles.designated_proxy_user_id uuid` (nullable, FK to profiles).
- Add `annual_review_instances.submitted_via_proxy boolean default false`, `annual_review_instances.proxy_submission_id uuid`.
- Create table `annual_review_proxy_submissions` (instance_id, employee_user_id, proxy_user_id, proxy_role, selfie_path, captured_at, ip, user_agent, declaration_text, created_at). Append-only — no UPDATE/DELETE policy.
- SECURITY DEFINER fn `public.can_proxy_submit_annual_review(_instance_id, _proxy_user_id) returns boolean`: checks (a) feature flag, (b) proxy role ∈ allowed set OR matches `designated_proxy_user_id`, (c) employee never signed in / no email, (d) instance is in self stage.
- RLS:
  - `annual_review_proxy_submissions`: INSERT allowed only when `can_proxy_submit_annual_review` is true; SELECT allowed to proxy, employee, RM, Skip-Level, HR, Admin.
  - No UPDATE / DELETE policies (immutable).
- Storage bucket `proxy-selfies` (private). Object RLS: insert requires matching instance id in path; read restricted to RM/Skip/HR/Admin via role check.

**Verification**: migration linter clean; `supabase--read_query` confirms columns & policies.

### Step 2 — Service layer (`src/services/annualReview/proxySubmission.ts`)
- `checkProxyEligibility(instanceId)` → RPC wrapper.
- `submitWithAssistance({ instanceId, selfieBlob, declarationAccepted })`:
  1. Upload selfie to `proxy-selfies/{instanceId}/{timestamp}.jpg`.
  2. Insert `annual_review_proxy_submissions` row.
  3. Call existing self-stage submit RPC with extra `{ proxy_submission_id }`.
  4. Rollback selfie upload if any step fails (graceful degradation).
- All logic isolated from UI per separation-of-concerns rule.

### Step 3 — UI components (lean, render-only)
- `src/components/annual-review/AssistedSubmissionDialog.tsx`:
  - Step 1: declaration checkbox + proxy identity preview.
  - Step 2: webcam preview (`getUserMedia`, front camera), "Capture" button, retake option. No file picker.
  - Step 3: review + submit. Toasts on success/failure.
- `src/pages/annual-review/EmployeeAnnualReview.tsx`: when `checkProxyEligibility` returns true, show "Submit with assistance" button next to existing Submit (which stays for self-login users).
- `src/components/annual-review/AnnualReviewStatusBadge.tsx` + `InstanceTimeline.tsx`: render "Assisted by X" badge when `submitted_via_proxy`.
- `src/components/annual-review/HrFinalizationSheet.tsx` (HR/Admin only): selfie thumbnail + metadata viewer.

### Step 4 — Feature flag & admin toggle
- Add toggle in existing PMS Admin → Settings page (`assisted_self_submission_enabled`). Off by default.

### Step 5 — Tests (`src/test/annualReview/proxySubmission.test.ts`)
- Eligibility: blocks when employee has logged in; allows when no email; allows for designated proxy.
- RLS: non-allowed role cannot read selfie path.
- Service: rollback when DB insert fails after upload.
- UI: gallery upload blocked, capture mandatory before submit enabled, declaration required.

### Step 6 — Docs
- Update `DOCUMENTATION.md` (Annual Review section) with assisted-submission flow + bucket/table reference.
- Update `POLICY.md` with eligibility, allowed proxies, retention of selfies, visibility rules.
- Add memory `mem://features/annual-review/assisted-submission`.

## UI Changes Summary
| Where | What | Visible to |
|---|---|---|
| `EmployeeAnnualReview` page | New "Submit with assistance" button + dialog (webcam, declaration) | Eligible proxies only |
| `AnnualReviewStatusBadge` / `InstanceTimeline` | "Assisted by {Name} ({Role})" pill | Everyone with instance access |
| `HrFinalizationSheet` / admin instance drawer | Selfie thumbnail + metadata | RM, Skip, HR, Admin only |
| Admin → Settings | Feature flag toggle | Admin |

## Out of Scope (explicit)
- Manager/Skip/HR stage proxy submission.
- Two-photo flow, geo capture, OTP — not requested.
- Retroactive proxy tagging of existing submissions.

## Rollback Strategy
- Migration is additive (new table + nullable columns + bucket). Disable via feature flag instantly; full revert by dropping new table/columns in a follow-up migration.
