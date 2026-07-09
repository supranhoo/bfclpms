# Fix: Observation attachments unreadable by KPI participants

## Root cause (verified)

The observation attachment preview fails with **"Preview failed: {}"** + toast **"Object not found"** because the storage SELECT RLS policy on the `review-evidence` bucket does not authorize the viewer (Satyam) to read the object.

Path shape used by `MultiFileUpload` when called from `AddObservationDialog`:

```
review-evidence / <uploaderUserId> / <kpiId> / observation-evidence / <timestamp>_<name>.<ext>
```

Current SELECT policy `"Users can view authorized evidence"` grants read only when the caller is:
- the uploader (folder[1] = auth.uid()), or
- admin / auditor / hr_pms, or
- uploader's direct manager, or
- uploader's skip-level manager.

For observations, the uploader is typically the **auditor or manager**, and Satyam is the **KPI's employee** (or a mentioned peer). None of the four branches match → Supabase Storage returns 404 (`Object not found`). This is a **category bug**, not a Satyam-specific one — every observation attachment uploaded by a reviewer is unreadable by the KPI owner and by mentioned users unless they happen to be admin/auditor/hr_pms or the uploader's manager.

Same policy is also used by review evidence proper, where the path convention `<kpiOwnerId>/…` accidentally aligns with `folder[1] = kpi owner`, so the existing rules work for that case. Observations broke the convention because the folder root is the *uploader*, not the KPI owner.

## Not Applicable
- UI changes — none.
- App logic changes — none.
- Documentation and policy updates as part of Change Log.

## Scope of scan (other places affected)

Checked all `review-evidence` upload sites:

| Upload site | Path root | Non-uploader viewers who need read | Status |
|---|---|---|---|
| `AddObservationDialog` (observations) | uploader.id | KPI employee, KPI reviewer chain, mentioned users | **BROKEN — fixing** |
| Review submission evidence | kpi.owner (employee) | manager/auditor/mgmt/hr_pms | works (role branches + manager chain) |
| `OrgKpiFileUpload` | `org-kpi-evidence/…` | anyone allowed by dedicated policy | works |

Only observation attachments are affected.

## Fix — extend SELECT policy for observation-evidence sub-tree only

Add an additional predicate to the existing `"Users can view authorized evidence"` policy (or, safer, add a **new** additive SELECT policy scoped to `folder[3] = 'observation-evidence'`) that grants read when the caller is a legitimate participant of the parent KPI.

New policy (additive, non-destructive):

```sql
create policy "Observation evidence readable by KPI participants"
  on storage.objects for select
  using (
    bucket_id = 'review-evidence'
    and (storage.foldername(name))[3] = 'observation-evidence'
    and exists (
      select 1
      from public.kpis k
      left join public.profiles emp   on emp.id = k.employee_id
      left join public.profiles mgr   on mgr.id = emp.reporting_manager_id
      where k.id::text = (storage.foldername(objects.name))[2]
        and (
          -- KPI owner
          k.employee_id = auth.uid()
          -- Direct manager of the KPI owner
          or emp.reporting_manager_id = auth.uid()
          -- Skip-level manager
          or mgr.reporting_manager_id = auth.uid()
          -- Assigned auditor for this KPI (any active assignment)
          or exists (
            select 1 from public.kpi_auditor_assignments a
            where a.kpi_id = k.id and a.auditor_id = auth.uid()
          )
          -- Mentioned in any observation on this KPI
          or exists (
            select 1
            from public.kpi_observations o
            where o.kpi_id = k.id
              and auth.uid() = any (coalesce(o.mentioned_user_ids, '{}'::uuid[]))
          )
        )
    )
  );
```

Kept as a **separate additive policy** so the existing broad policy is untouched (rollback = drop the new policy). Uses `security definer`-safe joins on tables already reachable in existing storage policies; no new SECURITY DEFINER function required. If the exact column names for auditor assignment / mention arrays differ from the above, resolve during implementation by inspecting `public.kpi_auditor_assignments` and `public.kpi_observations` first and adjusting the predicate — no schema change.

## Risk & Impact Report
- **Data Impact**: none. Additive RLS policy on `storage.objects` only. No schema change, no data migration.
- **Workflow Impact**: none for uploaders; adds read for legitimate viewers only.
- **UI/UX Impact**: previously-broken preview now succeeds. No component change.
- **Regression Risk**: low — the new policy is additive and gated by `folder[3] = 'observation-evidence'`, so review evidence, org-kpi evidence, and every other sub-tree behave exactly as before.
- **Scalability Impact**: two indexed lookups (`kpis.id`, join to `profiles`) per download; cached by PostgREST plan. Comparable cost to existing manager-chain subquery already in the current policy.
- **Rollback**: `drop policy "Observation evidence readable by KPI participants" on storage.objects;`.

## Tests

1. **SQL smoke check** in migration itself — run four `SELECT` probes as different auth contexts (KPI owner, direct manager, unrelated user, mentioned peer) using `set local role` + `request.jwt.claims` and assert visibility matches expectation.
2. **New Vitest guard** `src/test/review/observationEvidenceAccess.test.ts` that reads the migration SQL file and asserts:
   - the new policy exists and references `observation-evidence`
   - it references `kpi_observations` and `kpi_auditor_assignments`
   - it does NOT drop the existing `"Users can view authorized evidence"` policy.

## Documentation / Policy sync

- Append to `DOCUMENTATION.md` → *Version History*: new ADR reference + one-liner.
- New ADR `docs/adr/ADR-106.md` capturing: symptom, root cause (path root = uploader, not KPI owner), decision (additive policy scoped by folder segment), rejected alternatives (move uploads under kpi owner folder — breaks existing observation URLs).
- Update `mem/architecture/security/review-evidence-onbehalf-upload.md` with a note that observation attachments live under `<uploader>/<kpiId>/observation-evidence/…` and are read-gated by KPI participation, not folder ownership.

## Steps
1. Confirm column names on `public.kpi_observations` (mentions array) and `public.kpi_auditor_assignments` via a single `read_query`.
2. Write migration adding the new SELECT policy exactly as above (adjusted for real column names).
3. Add the Vitest source-guard file.
4. Update ADR-106, DOCUMENTATION.md version history, and the memory file.
5. Verify with a fresh preview render (Playwright) that the same observation attachment now loads for the KPI owner.
