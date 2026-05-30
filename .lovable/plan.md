
## 1. Assumptions
- Org-wide rollout: every authenticated employee (any role, any module access) must be able to file a safety incident from `/safety/incidents/new`, online or offline.
- Current failure is reproducible: direct browser INSERT into `public.safety_incidents` intermittently fails with `42501` RLS violation even though the policy text (`auth.uid() IS NOT NULL AND reporter_id = auth.uid()`) and BEFORE trigger look correct in the live DB.
- Root cause (per the completed 5-Why RCA): the write path depends on `auth.uid()` being resolvable at `WITH CHECK` evaluation time AND on the client sending a `reporter_id` that matches it. Any mismatch (stale JWT propagation, offline-queued payload submitted under a different session, profile-id vs auth-id confusion, claim GUC not present on the request connection) surfaces as an RLS violation with no diagnostic.
- Fix must be additive and reversible — no destructive schema changes, existing incident rows untouched.

## 2. Clarifications
None blocking. The RCA already confirmed: login present, grants present, profile active, single permissive INSERT policy, trigger attached, no failed rows persisted. Proceeding with the server-authoritative submission path that the RCA recommended.

## 3. Risk & Impact Report
- **Data Impact:** No schema break. Adds one `SECURITY DEFINER` RPC (`public.report_safety_incident`). Existing `safety_incidents` table, columns, triggers, and SLA view unchanged. Idempotency key `client_submission_id` continues to be the dedup anchor.
- **Workflow Impact:** Incident reporting becomes universal for any authenticated user — matches the stated rollout policy. Stage transitions, RCA/CAPA, closure, SELECT/UPDATE/DELETE gates remain role-scoped and unchanged.
- **UI/UX Impact:** None visible. The new-incident form and offline queue keep their current UX; only the submission call site swaps from `.from('safety_incidents').insert(...)` to `.rpc('report_safety_incident', ...)`. Toasts, validation, evidence upload flow preserved.
- **Regression Risk:** Medium → contained. Risk areas: (a) idempotency on retry, (b) offline queue flush, (c) evidence upload using returned `id`, (d) incident-number generation. Mitigated by keeping `client_submission_id` UNIQUE and the existing BEFORE INSERT trigger as the numbering/SLA source of truth, and by adding live insert-path tests (not just SQL-text tests).
- **Scalability Impact:** Single-row insert per submission; RPC is O(1). No N+1, no fan-out. Evidence upload loop unchanged. No new indexes required.
- **Auditability:** Reporter identity is derived from the verified JWT inside the RPC (`auth.uid()`), never trusted from the client payload. Impersonation surface is removed at the API boundary, not just at the policy boundary.
- **Mitigation Plan:** (1) Keep the existing restrictive INSERT policy in place as a defence-in-depth net. (2) Add a runtime regression test that actually performs an insert through PostgREST as an authenticated user — closes the test gap identified in the RCA. (3) Provide a single rollback migration that drops the RPC and restores the direct-insert call site.

## 4. Step-by-step Plan

```text
[Client form / offline queue]
        │  payload (no reporter_id trusted)
        ▼
supabase.rpc('report_safety_incident', { ... })
        │  SECURITY DEFINER
        ▼
public.report_safety_incident(p_payload jsonb)
  1. v_uid := auth.uid();  RAISE if NULL
  2. dedup on (v_uid, client_submission_id) → return existing row if found
  3. INSERT into safety_incidents with reporter_id := v_uid
  4. BEFORE INSERT trigger stamps incident_number, SLA deadlines
  5. RETURN { id, incident_number, reused }
        │
        ▼
Client uploads evidence to storage + writes safety_incident_evidence rows
(unchanged from today; uses returned id)
```

### Steps + verification

1. **Add RPC `public.report_safety_incident(p_payload jsonb) RETURNS jsonb`** — `SECURITY DEFINER`, `SET search_path = public`, owned so it can write. Resolves caller via `auth.uid()`, raises `insufficient_privilege` if NULL, dedups on `(reporter_id, client_submission_id)`, inserts with server-stamped `reporter_id`, returns `{ id, incident_number, reused }`. Grant `EXECUTE ... TO authenticated`. Revoke from `anon`.
   - Verify: SQL unit test in migration comment + live regression test in step 4.
2. **Keep the existing restrictive INSERT policy** on `safety_incidents` unchanged as defence-in-depth. The RPC writes as definer so the policy is bypassed for this entrypoint only; direct table inserts (legacy or rogue clients) remain gated.
   - Verify: `pg_policies` snapshot in migration; matrix doc update.
3. **Refactor `src/lib/safetyIncidentSubmit.ts`** to call the RPC instead of `.from('safety_incidents').insert(...)`. Drop the now-redundant pre-insert lookup (the RPC handles dedup atomically). Evidence upload loop is unchanged — it uses the returned `id`. `useReportSafetyIncident` in `src/hooks/useSafetyIncidents.ts` already routes through this codepath via the form; keep its mutation but switch its insert to the RPC for parity with the offline flush path so there is exactly one server entrypoint.
   - Verify: type-check, unit test, live click-through on `/safety/incidents/new`.
4. **Tests** (closes the RCA's identified test gap):
   - Extend `src/test/safety/incidentReportRlsPolicy.test.ts` to assert the migration creates `report_safety_incident` with `SECURITY DEFINER`, grants EXECUTE to authenticated, and revokes from anon.
   - Add a new live test `src/test/safety/incidentReportRpc.test.ts` that signs in via the anon key as a seeded test user and calls the RPC end-to-end — proving the actual insert path works (not just the SQL text).
   - Add a negative test: unauthenticated call → RPC raises; client-supplied `reporter_id` is ignored (server stamps `auth.uid()`).
   - Add an idempotency test: same `client_submission_id` returns the same row with `reused: true`.
5. **Docs + Policy + Memory sync (mandatory SSOT):**
   - `DOCUMENTATION.md` → new section + Version History bump documenting the server-authoritative submission entrypoint and why direct-insert was retired for new code paths.
   - `POLICY.md` → §Phase18-Safety: "Incident reports MUST be created via `public.report_safety_incident`. Browser code MUST NOT insert into `public.safety_incidents` directly. Reporter identity is server-derived from the verified JWT and is never trusted from the client payload."
   - `docs/safety/phase1/rls-matrix.md` → add §F-RLS-05 noting the SECURITY DEFINER entrypoint and that the restrictive INSERT policy is retained as defence-in-depth.
   - `mem/features/safety/incident-report-open-insert.md` → update to point at the RPC as the canonical entrypoint while noting the policy is unchanged.
   - New memory `mem/features/safety/incident-submission-rpc.md` describing the contract, dedup key, and rollback.

## 5. UI Changes
Not Applicable. The form, validation, severity selector, evidence picker, offline banner, and success toast remain visually and behaviorally identical. Only the network call underneath changes.

## 6. Implementation (to be executed after approval)
- 1 migration: `report_safety_incident` RPC + GRANT/REVOKE.
- 1 frontend file edited: `src/lib/safetyIncidentSubmit.ts`.
- 1 frontend file edited: `src/hooks/useSafetyIncidents.ts` (`useReportSafetyIncident` switched to RPC for entrypoint parity).
- Tests + docs as listed above.
No other files touched.

## 7. Tests
- Static: migration-text assertions for RPC definition, GRANT, REVOKE, SECURITY DEFINER, search_path pinning.
- Runtime: live insert via RPC as authenticated user (happy path).
- Runtime: unauthenticated call rejected.
- Runtime: client-supplied `reporter_id` is overridden by `auth.uid()`.
- Runtime: idempotent retry returns same row with `reused: true`.
- Regression: offline queue flush submits via the same RPC.

## 8. DOCUMENTATION.md updates
- New subsection "Safety Incident Submission (Server-Authoritative Entrypoint)" describing the RPC contract, dedup key, evidence pipeline, and why direct table inserts were retired for the new-incident path.
- Append to "Version History": `vX.Y — Phase 18 Safety: server-authoritative incident submission RPC; universal reporting access verified for org-wide rollout.`

## 9. POLICY.md updates
- New §Phase18-Safety: universal incident-reporting access; submission MUST go through `public.report_safety_incident`; `reporter_id` is server-stamped; no direct browser INSERTs into `safety_incidents`; impersonation surface eliminated at the API boundary.

## 10. Post-implementation notes
- **Rollback strategy:** revert `src/lib/safetyIncidentSubmit.ts` + `useReportSafetyIncident` to the prior direct-insert form and drop the RPC in a single migration. No data migration needed — `safety_incidents` rows created via the RPC are schema-identical to rows created via direct insert.
- **Backup coverage:** No new tables, so the auto-discovered `public.get_backup_table_order()` set is unaffected. No denylist change required.
- **Why this fix and not "patch the policy again":** Two prior fixes adjusted policy text and the BEFORE trigger but the failure persists at runtime. The RCA showed the test suite only validated migration text, never live insert behavior. Moving the write behind a SECURITY DEFINER RPC removes the entire class of `auth.uid()`-at-WITH-CHECK-time failures while preserving anti-impersonation, idempotency, numbering, and SLA logic. The restrictive INSERT policy stays as a belt-and-braces guard against rogue direct inserts.
