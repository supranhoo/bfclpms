## Goal
Make Safety Head the final approver. Remove the intermediate **Verification** stage so the flow ends at **Safety Head Review → Closed**. Safety Head can either close the incident (with optional final remarks) or send it back to the assigned user.

## New stage order
```text
reported → management_review → assigned → investigation → rca →
corrective_action → safety_head_review → closed
```
(`verification` is retired. `orphaned` exception path is unchanged.)

## Risk & Impact

- **Data:** Historical incidents currently sitting in `verification` must be migrated. Plan: in the same migration, move any existing `status='verification'` rows to `safety_head_review` (preserving audit trail) so no row references the dropped enum value. `final_score` / immutability rules unchanged.
- **Workflow:** Safety Head action panel changes from "Assign Verifier + Advance to Verification" to "Close Incident" (with final remarks + optional send-back). Verifier assignment UI retired for incidents.
- **SLA:** `close_due_at` rule unchanged — Safety Head closure is still the terminal event the SLA measures against.
- **RLS / RPC:** `transition_safety_incident()` validation list shortened. Closure permission gated to Safety Head role only.
- **Regression risk:** Anywhere that switches on `'verification'` (badges, filters, dashboard counters, tests). Mitigation: SSOT in `src/lib/safetyIncidents.ts` drives almost all UI; grep+fix the rest and update tests.
- **Backup:** No new tables; existing tables retained. No backup impact.

## Implementation steps

1. **DB migration** (`supabase/migrations/...`)
   - Re-point any live rows: `UPDATE safety_incidents SET status='safety_head_review' WHERE status='verification'` (log via existing audit trigger).
   - Update `transition_safety_incident()` RPC: new sequential list ends at `safety_head_review → closed`; only users with Safety Head role may execute the `→ closed` transition; accept optional `closure_remarks` and persist into the timeline/audit row.
   - Keep the `verification` enum value present (Postgres can't drop enum values safely) but mark it deprecated in a comment; FSM no longer accepts it as a legal target.

2. **SSOT** (`src/lib/safetyIncidents.ts`)
   - Remove `verification` from `SAFETY_INCIDENT_STAGES` and labels.
   - `nextStage('safety_head_review')` returns `'closed'`.
   - `validateFsmTransition` auto-updates from the SSOT array.

3. **Stage action panel** (`src/components/safety/StageActionPanel.tsx`)
   - For `safety_head_review`: render Safety-Head-only panel with **Final Remarks** textarea, **Close Incident** primary action, and **Send Back to Assignee** secondary action. Remove verifier picker + "Advance to Verification".
   - Hide the panel for non-Safety-Head users (read-only summary).

4. **Cleanup references**
   - Grep `'verification'` / "Verification" / "verifier" across `src/`, remove stage-specific badges, filters, dashboard tiles, and timeline mappings. Keep only historical-display fallback (label remains in `SAFETY_STATUS_LABELS` as "Verification (legacy)" so old audit rows still render).

5. **Tests**
   - Update `src/test/safetyFsmAndSla.test.ts` to assert the new 8-stage list and `safety_head_review → closed` is legal while `→ verification` is illegal.
   - Add a test: only Safety Head role can perform the closure transition; non-Safety-Head gets rejected.
   - Add UI test: StageActionPanel at `safety_head_review` renders Close/Send-Back actions and no verifier picker.

6. **Docs / Policy**
   - Update `DOCUMENTATION.md` workflow diagram + `POLICY.md` closure-authority section. Version-history entry: "Verification stage retired; Safety Head is terminal approver."

## Rollback
Revert migration sets enum-driven list back to 9 stages and restores the prior RPC body (kept in the migration's `-- previous version` comment block). No destructive schema changes (enum value preserved).

## Out of scope
Notification template copy changes beyond stage-name substitution; bulk-historical re-labelling of closed incidents.
