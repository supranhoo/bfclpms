# Fix observation-reply attachment RLS failure for employee 101715

## Assumptions
- The reported failure is attachment upload from observation **OBS-02854**, not posting a text-only reply.
- Existing private evidence access must remain limited to the employee, assigned reviewers/auditors, authorized management roles, and explicitly mentioned participants.
- Existing evidence objects must remain readable; no destructive data migration is acceptable.

## Confirmed RCA
Employee **101715 (Jitendra Bharti)** is active, has a valid auth account, and has successfully uploaded evidence recently. Re-login therefore does not address the defect.

The observation reply UI sends:

```text
<live-user-id>/<observation-id>/observation-replies/<unique-file>
```

However, the consolidated evidence read policy treats the second path segment as a **KPI ID** and calls the KPI-participant resolver with it. For OBS-02854, the second segment is observation ID `f6387e5b-...`, while the actual KPI is `c7941c8b-...`.

The uploader uses `upsert: true`. Although filenames are timestamp-unique, upsert introduces read/update authorization checks. Since the policy cannot resolve the observation ID as a KPI, the storage operation is rejected with RLS. The frontend then incorrectly classifies every RLS denial as an expired session, hiding the real authorization mismatch.

The database contains **466** observation-reply files, **461** of which use an observation ID in this path position, so this is a systemic regression rather than a user-specific account issue.

## Five-Why Analysis
1. **Why could 101715 not attach a file?**  
   The private evidence store rejected the request under row-level authorization.
2. **Why did authorization reject a signed-in user?**  
   The upload requested upsert behavior, which depends on read/update authorization in addition to create authorization.
3. **Why did the read authorization fail?**  
   It passed the path's second segment to the KPI-access resolver.
4. **Why was that segment not a valid KPI for observation replies?**  
   `ObservationReplyThread` intentionally supplies `observationId` as `contextId`, while the consolidated policy assumes all contexts are KPI IDs.
5. **Why did the previous fix not solve it?**  
   ADR-305 assumed an expired session from the generic RLS message without validating the policy/path contract. Its retry repeats the same incompatible request, and its message labels all RLS failures as session expiry.

## Risk & Impact Report
- **Data impact:** Additive authorization-function/policy correction only; no evidence rows or files will be deleted or moved. Existing 461 observation-context reply files become correctly resolvable.
- **Workflow impact:** Observation participants can attach and reopen authorized evidence. Unauthorized users remain denied.
- **UI/UX impact:** No layout change. Error messages will distinguish session expiry from a signed-in authorization/configuration failure.
- **Regression risk:** Medium because the shared uploader serves self, reviewer, auditor, management, and observation evidence.
- **Scalability impact:** Resolve the context through indexed primary-key lookups (`kpis.id`, then `kpi_observations.id`) with no unbounded scans. Upload filenames remain unique and do not require overwrite behavior.
- **Backup impact:** No new table or bucket; existing automatic `review-evidence` backup coverage is unchanged.
- **Rollback:** Restore the prior resolver/policy and uploader option. No data rollback is needed.
- **Mitigation:** Contract tests for every supported folder, signed-in runtime probes, denied-user checks, and security linting.

## Step-by-step Plan

### 1. Correct the shared evidence context contract
- Introduce one backend authorization resolver that accepts the storage context and folder.
- For normal evidence folders, resolve the second segment directly as a KPI ID.
- For `observation-evidence` and `observation-replies`, resolve an observation ID through `kpi_observations.kpi_id`, while retaining compatibility with any older paths that already contain a KPI ID.
- Reuse the existing KPI-participant authorization after canonical KPI resolution; do not add permissive `USING (true)` access.
- Update the consolidated private-file read policy to call this resolver.

**Verification:** Confirm OBS-02854 resolves to its actual KPI and that 101715 is an authorized KPI employee. Confirm an unrelated authenticated user resolves to denied.

### 2. Remove unnecessary overwrite semantics from unique uploads
- Change `MultiFileUpload` observation/shared evidence uploads from `upsert: true` to create-only uploads because generated paths already contain a timestamp and sanitized filename.
- Keep one controlled retry only for a genuinely refreshed credential; do not retry deterministic policy mismatches.
- Preserve existing URLs and multi-file behavior.

**Verification:** Upload two same-named files and confirm both create distinct objects without overwrite/read-policy dependency.

### 3. Fix error classification
- Determine session expiry from the live session/refresh result, not from the generic RLS phrase alone.
- Show “Sign in again” only when no valid session remains.
- For a valid signed-in session with an authorization denial, show an accurate access/configuration message and retain diagnostic detail for support.

**Verification:** Unit-test expired-session, valid-session authorization denial, unsupported file, and successful retry branches.

### 4. Add regression tests and realistic mock data
- Extend evidence path/policy contract tests for:
  - KPI self evidence using KPI context.
  - Observation evidence using observation context.
  - Observation reply using observation context.
  - Legacy observation reply using KPI context.
  - Authorized employee/reviewer/auditor access.
  - Unrelated-user denial.
  - Same-name multi-upload without overwrite.
- Add a mock equivalent of OBS-02854 with distinct observation and KPI IDs so the mismatch cannot regress unnoticed.

### 5. Runtime and security verification
- Execute the real upload path with a signed-in session and inspect the stored object owner and path.
- Post an observation reply referencing the uploaded URL and reopen the attachment.
- Test a second caller without KPI participation and confirm upload/read remain denied.
- Run the backend security linter and relevant unit/integration tests.

**Authenticated path:** Currently reproduced by the user but not yet independently verified end-to-end in the sandbox. It will be reported as `UNVERIFIED` unless the signed-in upload, stored owner inspection, reply submission, and reopen checks all complete.

## UI Changes
- No structural or responsive UI changes.
- Only the failure toast copy changes so a valid session is no longer falsely reported as expired.

## Documentation and Policy Updates
- Update `DOCUMENTATION.md` with the canonical storage context contract and version history entry.
- Update `POLICY.md` to state that observation evidence may carry an observation context that must resolve to a KPI before participant authorization.
- Add an ADR amendment superseding ADR-305's “all RLS upload failures imply session expiry” assumption.

## Post-implementation Notes
- Report authenticated and unauthorized verification separately.
- Preserve all existing evidence and automatic backup coverage.
- If the signed-in runtime request cannot be executed, explicitly report `Authenticated path: UNVERIFIED` and do not claim the issue is fixed.
