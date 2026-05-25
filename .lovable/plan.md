## Goal

Make **Bulk Sign-off (with Override)** a true "**Process all 4**" action so it:

1. Writes the selected stage on **every** selected cell — including cells already at `approved` (locked `final_score`).
2. For approved cells, **re-stamps `final_score`** if the acted stage is that employee's **terminal** stage, leaving status at `approved` (immutability is preserved as "explicit admin override with full audit", not "silent drift").
3. For non-approved cells, advances the KPI to the next stage / `approved` exactly as today (already working in the latest migration).
4. Returns a single coherent toast: **"Process complete — N approved, M re-stamped, K unchanged"** — never "failed".
5. Every override decision is captured in `kpi_audit_logs` with action `ADMIN_BULK_OVERRIDE_FINAL_UNLOCK` (for re-stamps) or `BULK_STAGE_SIGNOFF_<STAGE>` with `is_override:true` (for normal cells).
6. **POLICY §88 is amended** to formally permit Admin-Override re-stamp; rollback path stays the canonical "self-service" mechanism.

---

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | `final_score` of *approved* rows may be rewritten. | Only when `is_admin=true` AND `is_override=true` AND acted stage matches employee's resolved terminal stage. Old value captured in audit `old_value`. |
| Workflow | Status of approved rows does NOT change (stays `approved`). Non-approved rows behave as today. | Explicit `IF kpi.status='approved' THEN do not reconcile` guard. |
| Policy | §88 (Submission Snapshot Immutability) — needs a formal Admin-Override carve-out. | New §88.1 added; CHANGELOG entry; ADR-066. |
| RLS | `bulk_write_stage_scores` is `SECURITY DEFINER`; admin gate already enforced (`p_is_override` is silently cleared if user is not admin). | No change needed. |
| Regression | Existing non-override bulk path must remain byte-identical. | New code paths gated entirely on `p_is_override=true`; existing tests must still pass. |
| Scalability | Same batch loop as today — no extra round-trips. | None. |
| Rollback | Pure SQL function — `CREATE OR REPLACE` can be re-deployed to revert. | Keep prior migration intact; new migration is additive. |

---

## What changes (code + policy)

### 1. Migration — `bulk_write_stage_scores` Override carve-out

Replace the function body so the per-cell skip ladder respects `p_is_override`:

```text
SKIP RULES (final, exhaustive)
─────────────────────────────────────────
not_found                ALWAYS skip
final_locked             skip UNLESS (is_admin AND is_override)
self_not_submitted       skip UNLESS is_override
auditor_takes_precedence skip UNLESS is_override
row_version_conflict     skip UNLESS is_override
no_prior_score           skip UNLESS (manual OR achieved supplied)
override_requires_input  raised when is_override AND no manual AND no achieved
```

Override write logic for **locked (already approved)** rows:

1. Compute `v_score` (manual / achieved / inherited — same rules).
2. Resolve employee's terminal stage via `get_employee_workflow_info`.
3. Write the role-specific column (`hr_pms_score`, etc.) — same as non-locked.
4. **If `kpi.status = 'approved'` AND acted stage = terminal stage:**
   - `UPDATE review_submissions SET final_score = v_score, final_rating = …`
   - Insert audit row `ADMIN_BULK_OVERRIDE_FINAL_UNLOCK` with `old_value={final_score:OLD}`, `new_value={final_score:NEW, acted_stage, batch_id}`.
   - Do **not** touch `kpis.status` (stays `approved`).
   - Increment new counter `v_relocked_count`.
5. **If `kpi.status = 'approved'` AND acted stage ≠ terminal stage:**
   - Write the column only; do NOT touch `final_score`. Push skip reason `final_locked_non_terminal` (informational, not error) so the toast can explain it.
6. **If `kpi.status ≠ 'approved'`:** existing chained reconcile runs, as today.

New counters returned in the `bulk_review_batches.scope_filters` JSON + RPC result:
- `v_applied` (rows written — unchanged semantics)
- `v_advanced_count` (reconciled to approved — unchanged)
- `v_relocked_count` (NEW — approved rows whose `final_score` was admin-overridden)
- `v_non_terminal_count` (unchanged)

### 2. Frontend — `summariseSkipReasons.ts`

Add labels:
- `final_locked_non_terminal` → "already finalised — stage isn't the terminal one for this employee, column updated but final score untouched"
- `override_requires_input` → "override needs an Achieved or manual score (none supplied)"

### 3. Frontend — `summariseStageWriteOutcome`

Extend `StageWriteOutcome` interface with `relocked: number`.
New title rule:
- `advanced + relocked === total` → **"Process complete — N approved, M re-stamped"**
- `advanced > 0 AND relocked > 0` → same title, line breakdown
- `relocked === total AND advanced === 0` → **"Final scores re-stamped — N rows"**
- All other branches remain.

### 4. Frontend — `BulkApproveDialog.tsx`

The amber Override panel gets a third bullet:

> Includes **already-approved** rows. Their `final_score` will be re-stamped from this stage's value if this stage is the employee's terminal review stage. Every re-stamp is audit-logged as `ADMIN_BULK_OVERRIDE_FINAL_UNLOCK` (POLICY §88.1).

The CTA label changes when `isOverride=true && cellCount includes approved rows` (we already preview this) → **"Override sign-off (N approved · M draft)"**.

### 5. Frontend — `BulkSignoffPreview.tsx`

Surface a per-row chip when row is `final_score IS NOT NULL`:
- Pre-override: red chip *"Locked — will skip"*
- Override on: amber chip *"Will re-stamp final score"* (if terminal) or grey *"Column-only update"* (if non-terminal).

### 6. POLICY.md — new §88.1 + CHANGELOG

```
§88.1 Admin-Override Re-Stamp Exception
---------------------------------------
The §88 immutability rule MAY be deliberately bypassed by an Admin only via
the Bulk Sign-off "Override" toggle (RPC: bulk_write_stage_scores with
p_is_override = true). When triggered:

  a. The bypass is per-row, per-stage; no global "unfreeze" exists.
  b. Final score is re-stamped only if the acted stage is the resolved
     terminal stage of that employee's workflow template for the period.
  c. KPI status remains 'approved'; no stage hop occurs.
  d. Both the old and the new final_score MUST appear in
     kpi_audit_logs.action = 'ADMIN_BULK_OVERRIDE_FINAL_UNLOCK' with
     batch_id and a mandatory ≥10-char remark.
  e. Notification 'admin_override_of_final_score' is sent to the employee,
     their reporting manager, and HR PMS group (reuses existing dispatch).

Out of scope: self-service rollback (POLICY §12.1) remains the canonical
path for non-admin corrections.
```

CHANGELOG row:
`| 2.66.13.17 | 2026-05-25 | Admin Override may re-stamp final_score on approved rows (POLICY §88.1) with full audit trail and notification. |`

ADR-066 cross-link to §88 and §88.1.

### 7. DOCUMENTATION.md

Update §111.7.d (Bulk Sign-off table) with three new rows: `final_locked` (admins: re-stamps), `final_locked_non_terminal`, `override_requires_input`.

### 8. Notification — new type

Insert one row into `public.notifications` per re-stamped KPI:
```
type     = 'admin_override_of_final_score'
title    = 'Final score updated by admin override'
message  = 'Your <KPI> score for <Period Year> was re-stamped from X.X to Y.Y by an admin override. See audit trail.'
metadata = {kpi_id, old_final, new_final, batch_id, performed_by}
```
Recipients: `kpi.employee_id`, `profiles.reporting_manager_id`, every user with role `hr_pms`.

### 9. Tests

New unit tests:
- `summariseSkipReasons.test.ts` — both new labels.
- `summariseStageWriteOutcome` — 4 new branches (relocked-only; mixed advanced+relocked; relocked + non_terminal skip; override_requires_input).
- `bulkWriteStageScoresContract.test.ts` — 3 new contracts:
  - Override on approved + terminal stage → relocked counter +1, `final_score` updated, status stays `approved`, audit `ADMIN_BULK_OVERRIDE_FINAL_UNLOCK` present.
  - Override on approved + non-terminal stage → column updated, `final_score` UNCHANGED, skip `final_locked_non_terminal` present.
  - Override with no manual/achieved AND no prior score → skip `override_requires_input`.

### 10. Mock data update

Seed fixture for the regression suite: 4 employees mirroring the live April-2026 case (2 approved + 2 self_review on the same KPI) so this exact bug never returns.

---

## Files touched

| Path | Kind |
|---|---|
| `supabase/migrations/202605251xxxxx_admin_override_relock.sql` | NEW migration (replaces `bulk_write_stage_scores`) |
| `src/lib/summariseSkipReasons.ts` | edit |
| `src/lib/summariseSkipReasons.test.ts` | edit |
| `src/lib/bulkSignoffImpact.ts` | edit (preview surfaces locked rows differently when override on) |
| `src/components/review/BulkApproveDialog.tsx` | edit |
| `src/components/review/BulkSignoffPreview.tsx` | edit |
| `src/pages/review/BulkReviewDashboard.tsx` | edit (toast title rule) |
| `src/test/bulkWriteStageScoresContract.test.ts` | edit |
| `POLICY.md` | edit (§88.1 + CHANGELOG) |
| `DOCUMENTATION.md` | edit (§111.7.d table) |
| `docs/adr/ADR-066.md` | NEW |
| `mem/features/review/final-score-governance-and-immutability` | edit (note the §88.1 carve-out) |

---

## Step-by-step build order (after approval)

1. **Migration** — write & request approval (single file, additive, replaces RPC only).
2. **Frontend libs** — `summariseSkipReasons.ts` + `summariseStageWriteOutcome` + tests.
3. **Preview + Dialog UI** — chips, CTA wording, helper text.
4. **Toast wiring** — `BulkReviewDashboard.tsx`.
5. **Notification type** — wired in the migration body (single INSERT loop at end).
6. **Tests** — unit + contract green.
7. **Docs** — POLICY §88.1, CHANGELOG, ADR-066, DOCUMENTATION §111.7.d, memory note.
8. **Smoke** — re-run the exact 4-employee April-2026 scenario in dev with `is_override=true`; expect toast **"Process complete — 2 approved, 2 re-stamped"**.

---

## Verification (must hold before sign-off)

- [ ] Live scenario (Ankit, Deepak, Rahul, Sourav, April 2026, Cost Centre Verification) → 4/4 processed, 0 skipped.
- [ ] `kpi_audit_logs` shows 2 × `BULK_STAGE_SIGNOFF_HR_PMS` + 2 × `ADMIN_BULK_OVERRIDE_FINAL_UNLOCK` with old/new final_score diff.
- [ ] Status of Deepak/Sourav remains `approved` (no regression of stage).
- [ ] Status of Ankit/Rahul moves to `approved` via existing chained reconcile.
- [ ] Without override toggle, behaviour is byte-identical to today (existing contract test passes).
- [ ] Non-admin cannot trigger the new path (admin gate already enforced server-side).

---

## Open questions for confirmation (block build until answered)

1. **Notification recipients** — OK to notify employee + reporting manager + HR PMS group on every re-stamp? Or admin-only audit trail (no employee notification)?
2. **Re-stamp on non-terminal stage** — should we *also* re-stamp `final_score` when override hits a *non-terminal* stage of an approved row (i.e. force-overwrite from any stage)? My recommendation is **no** (column-only), per §88.1 (c). Confirm.
3. **Old-value preservation** — store the previous `final_score` in `review_submissions.previous_final_score` column for forensic reads, or rely solely on `kpi_audit_logs`? Recommendation: audit-log only (no schema bloat).
