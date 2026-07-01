## Issue
Employees see **"Preview failed: Object not found"** when opening the supporting file attached to an Organization KPI (e.g. `org-kpi-evidence/…_Self_Evidence.xlsx`). Admins/HR PMS/Auditors can still open it — only ordinary employees (and managers/skip-managers of ordinary employees) are blocked.

## Root Cause
The `review-evidence` bucket is private, so every read goes through storage RLS. The current SELECT policy `Users can view authorized evidence` (migration `20260622103745`) matches only when `storage.foldername(name)[1]` is either the caller's own `auth.uid()` **or** the UUID of a profile they manage. Org-KPI files are stored under a fixed prefix — `org-kpi-evidence/<file>` — so `foldername[1] = 'org-kpi-evidence'`, which never matches a profile id. There is INSERT/UPDATE/DELETE coverage for that prefix (migration `20260626112752`), but **no SELECT policy was added for it**. Result: Supabase returns 404 "Object not found" to non-privileged roles, which the preview dialog surfaces verbatim.

## 5-Why
1. Why does the employee see "Object not found"? → Storage returns 404 because RLS hides the object from them.
2. Why does RLS hide it? → The only SELECT policy on `review-evidence` requires the first folder segment to be a profile UUID, and admin/auditor/hr_pms roles.
3. Why doesn't that match Org-KPI files? → Org-KPI evidence is stored under the shared prefix `org-kpi-evidence/…`, not under a per-employee UUID folder.
4. Why is there no matching SELECT policy? → The 2026-06-26 hardening migration added INSERT/UPDATE/DELETE for the `org-kpi-evidence/` prefix but omitted a SELECT counterpart, assuming the general employee-folder SELECT policy would cover it.
5. Why did the omission ship? → No regression test asserted "authenticated employee can SELECT an `org-kpi-evidence/*` object", and the security-tightening review focused on write paths (ADR-096) and download URL signing (ADR-099), not read visibility of the shared org prefix.

## Risk & Impact Report
- **Data Impact:** additive SELECT policy only; no data mutation, no schema change.
- **Workflow Impact:** restores employee ability to view Org-KPI supporting evidence during self-review. No new privilege for external roles.
- **Security Impact:** Org KPI evidence is a company-wide artifact already surfaced to every reviewer through the Org-KPI cards; granting authenticated SELECT on the `org-kpi-evidence/` prefix matches its intended visibility and does not widen access to per-employee folders.
- **Regression Risk:** low. Change is scoped to `bucket_id = 'review-evidence' AND foldername[1] = 'org-kpi-evidence'`. Existing "Users can view authorized evidence" policy is untouched.
- **Rollback:** `DROP POLICY "Org KPI evidence select" ON storage.objects;`.

## CAPA
### Corrective
1. **DB migration** — add SELECT policy:
   ```sql
   CREATE POLICY "Org KPI evidence select"
   ON storage.objects FOR SELECT TO authenticated
   USING (
     bucket_id = 'review-evidence'
     AND (storage.foldername(name))[1] = 'org-kpi-evidence'
   );
   ```
   Scoped strictly to the shared Org-KPI prefix — mirrors the existing INSERT/UPDATE/DELETE policy shape from migration `20260626112752`.

### Preventive
2. **Regression guard** — `src/test/orgKpiEvidenceSelectPolicy.test.ts`: source-reading test (same style as `reviewEvidenceOnBehalfPolicy.test.ts`) that fails if any future migration drops the SELECT policy or removes the `org-kpi-evidence` prefix guard.
3. **Policy invariant** — add POLICY.md rule: *"Every storage prefix in `review-evidence` MUST have matching SELECT + INSERT + UPDATE + DELETE policies. Write-only or read-only prefixes are prohibited."*
4. **ADR-104** documenting the incident, root cause, fix, and the new invariant. Cross-link ADR-096 and ADR-099.
5. **DOCUMENTATION.md** — update Storage / RLS section to list the four Org-KPI evidence policies as a set.

## Verification Steps
- Run migration; confirm `storage.policies` lists the new SELECT policy.
- Sign in as an ordinary employee (e.g. 100735) → open an Org KPI that has an `.xlsx` evidence file → preview loads and Download works.
- Re-run `src/test/review/evidencePreview.test.ts` and new `orgKpiEvidenceSelectPolicy.test.ts` — all green.
- Confirm employee cannot still SELECT arbitrary `<other-employee-uuid>/…` paths (existing policy unchanged).

## Files Touched
- `supabase/migrations/<new>_org_kpi_evidence_select_policy.sql` (new)
- `src/test/orgKpiEvidenceSelectPolicy.test.ts` (new)
- `docs/adr/ADR-104.md` (new)
- `POLICY.md`, `DOCUMENTATION.md` (updated)

No frontend / component changes required — `EvidencePreviewDialog` and `OrgKpiFileUpload` already do the right thing once RLS permits the read.
