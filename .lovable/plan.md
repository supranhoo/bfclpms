## RCA — why admin 101785 sees "new row violates row-level security policy"

The Admin Data Entry dialog's evidence picker (`src/components/ui/EvidenceUpload.tsx`, lines 96 & 171) builds the storage object path as:

```
${userId}/${kpiId}/<timestamp>_<file>
```

`userId` is the **employee being acted upon** (Sajid Raza, `100264`), not the signed-in admin.

The `review-evidence` bucket has only these INSERT policies:
- **"Users can upload their own evidence files"** — `with_check: auth.uid()::text = foldername(name)[1]` → fails because folder = Sajid's id, not admin's id.
- **"Org KPI evidence insert"** — only allows the `org-kpi-evidence/...` prefix.

There is **no admin / hr_pms on-behalf INSERT policy** for the per-employee folder layout, so storage rejects the upload. (The SELECT policy already grants admin/auditor/hr_pms/manager/skip-level read access — only the write side is missing, which is why View works but Upload doesn't.)

This affects every admin-on-behalf evidence upload via `EvidenceUpload` (Org KPI, employee KPI, Annual Review proxy submissions — anywhere the dialog is used), not just KPI 101785's screen.

---

## Risk & Impact Report

- **Data Impact:** No schema change. Adds 3 storage RLS policies. Existing files & policies untouched. Fully additive.
- **Workflow Impact:** Restores admin-on-behalf upload parity with the read side. Non-admin behaviour unchanged.
- **UI/UX Impact:** None — same dialog, the upload simply succeeds.
- **Regression Risk:** Low. Policies are scoped to `bucket_id = 'review-evidence'` AND `has_role(admin|hr_pms)`. They cannot widen access to other buckets or to non-privileged users.
- **Scalability Impact:** None — policies are O(1) role checks.
- **Mitigation:** Mirror the existing SELECT policy's role gate (admin + hr_pms only). Auditors stay read-only by design. Rollback = drop the 3 new policies.

Rejected alternatives:
1. *Change the upload path to use `admin.uid()` as folder* — breaks the read policy for the employee themselves, and orphans files from the employee's folder grouping. Higher blast radius.
2. *Grant the upload via an edge function with service role* — heavier change, loses optimistic UX, and isn't needed once RLS reflects the existing privilege model.

---

## Plan

1. **Migration** — add three storage.objects policies for `review-evidence`:
   - `Admins and HR PMS can upload evidence on behalf` (INSERT, with_check)
   - `Admins and HR PMS can update evidence on behalf` (UPDATE, qual)
   - `Admins and HR PMS can delete evidence on behalf` (DELETE, qual)

   Each gated by: `bucket_id = 'review-evidence' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr_pms'))`. The existing per-user and Org-KPI policies remain — these are additive permissive policies.

2. **No code change** — `EvidenceUpload.tsx` already passes the correct (employee) folder, which is what we want so the employee and their reporting chain can read what the admin uploaded.

3. **Docs / Policy / Memory:**
   - `docs/adr/ADR-096.md` — record RCA, decision, rollback SQL.
   - `POLICY.md` — append §EVIDENCE-ONBEHALF-UPLOAD.
   - `DOCUMENTATION.md` — v2.66.63 release note.
   - `mem/architecture/security/review-evidence-onbehalf-upload.md` — codify the rule so future scanners/agents don't strip it.
   - `mem/index.md` — add the entry.

4. **Test** — `src/test/reviewEvidenceOnBehalfPolicy.test.ts`: assert the migration text contains the three policies with bucket + role guards (source-level regression guard, matching the pattern in `incentiveExportData.test.ts`).

## Out of scope

- No change to `OrgKpiFileUpload.tsx` (already covered by the Org-KPI policy).
- No change to the file-size / 5-file cap or the dialog UI.
- No change to bucket grants, public/private flag, or non-`review-evidence` buckets.
