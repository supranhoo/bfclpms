## 1. Assumptions

- The reported failure is the "Preview failed: {}" dialog when employee Dippendu Das (101773) opens auditor-uploaded evidence from the KPI details view.
- Fix must be additive: nobody currently able to view evidence loses access.

## 2. Verified findings (RCA)

Confirmed by reading the code and querying the backend:

- `review-evidence` is a **private** bucket.
- The only general read policy is **"Users can view authorized evidence"**, which authorizes on the **first path segment** (`storage.foldername(name)[1]`): the viewer must be that UUID, be its reporting manager / skip manager, or hold `admin` / `auditor` / `hr_pms`.
- `EvidenceUpload` builds paths as `` `${userId}/${kpiId}/...` `` where `userId` is **the uploader**, not the KPI owner. Reviewer surfaces therefore write auditor-owned folders. Real rows for this employee:
  - `f9556e9b-…(Auditor03)/e7f2a92f-…/reviewer-evidence/1784723216401_101773_Timely_Resolution_of_Customer_rel.png`
  - `3d06ca4d-…/…/reviewer-evidence/1777452387995_101773_Response_in_time_….pdf`
- Dippendu's UUID is `876f255c-…`, so for these objects segment 1 is the auditor, he is not the auditor's manager, and he holds no privileged role → storage denies SELECT. The SDK `.download()` returns an error whose body is empty, so `EvidencePreviewDialog` renders `Preview failed: {}`.

**5 Why**
1. Preview fails → 2. Storage SELECT denied → 3. Read policy keys on path segment 1 → 4. Segment 1 is the uploader, not the KPI owner → 5. No policy models "participants of this KPI may read this KPI's evidence" for the non-observation folders (only `observation-evidence` has such a policy).

## 3. Risk & impact

- **Data:** no schema change; one **new additive** storage SELECT policy. Existing policies untouched → zero regression for admins, auditors, HR, managers.
- **Security:** the new policy grants read strictly to KPI participants derived from `kpis.id` in path segment 2 — same participant set already accepted for observation evidence. No blanket/public read; bucket stays private.
- **Workflow/UI:** none beyond the preview working.
- **Scalability:** policy is an `EXISTS` on `kpis` by primary key + `profiles` manager lookups — indexed, negligible.
- **Regression risk:** low. Mitigated by tests plus a manual check that a non-participant still cannot read.
- **Rollback:** `DROP POLICY` of the single new policy restores today's behaviour exactly.

## 4. Plan

**Step 1 — Migration: additive read policy**
Create `Review evidence readable by KPI participants` on `storage.objects` FOR SELECT TO `authenticated`:
- `bucket_id = 'review-evidence'`
- path segment 3 in (`self-evidence`, `reviewer-evidence`, `auditor-evidence`, `management-evidence`, `observation-replies`) — i.e. per-KPI evidence folders
- `EXISTS` on `kpis k WHERE k.id::text = foldername(name)[2]` AND viewer is: the KPI owner, the owner's reporting manager, the skip-level manager, an assigned auditor (`audit_kpi_assignments` / `audit_kpi_level_assignments`), or holds `kpi_mention_access` for that KPI.
*Verification:* re-query the two real auditor-uploaded objects above as Dippendu's UUID via a `has-access` SQL simulation, and assert an unrelated employee is still denied.

**Step 2 — Client: honest error surface (no silent `{}`)**
In `src/components/review/EvidencePreviewDialog.tsx`, normalise empty/unparseable storage errors to a readable message ("You do not have access to this file, or it is no longer available") instead of printing the raw `{}`. Purely presentational.
*Verification:* unit test on the error-normalising helper.

**Step 3 — Forward-looking path correctness (low-risk, optional within this change)**
Reviewer surfaces should upload under the **KPI owner's** UUID so the primary policy alone suffices for future files. This is a one-line prop change per reviewer call-site (`userId` → employee id). Historical files are already covered by Step 1, so this is hardening, not the fix. I will list the call-sites and apply it only if you confirm — it changes where new files land.

**Step 4 — Tests**
- `src/test/review/evidenceStorageAccess.test.ts`: migration guard asserting the new policy exists, is SELECT-only, is scoped to `review-evidence`, and that no migration drops `Users can view authorized evidence` (parity guard, same pattern as `auditorReviewAccessMatrix.test.ts`).
- Preview error-normalisation unit test.

**Step 5 — Docs**
- `docs/adr/ADR-190.md` — Review evidence read access keyed to KPI participation, not upload folder.
- `POLICY.md` §EVIDENCE-READ-KPI-PARTICIPATION + memory update under `mem/features/review/office-evidence-preview.md`.

## 5. UI changes

Only the failure text inside the existing evidence preview modal (replaces `Preview failed: {}`). The "Download instead" button stays. No layout change.

## 6. Open question

Step 3 (making reviewer uploads land in the employee's folder) — apply now, or keep this change read-only and schedule it separately?
