---
name: Safety Audit & Compliance Checklists
description: Phase 5 — templated safety audits with weighted scoring, critical-fail incident auto-creation, and BU scoreboard
type: feature
---

## Schema (4 tables, 1 enum + 1 enum)
- `safety_audit_templates` (code, title, category, version, is_active)
- `safety_audit_template_items` (section, prompt, weight, is_critical, evidence_required, sort_order)
- `safety_audit_runs` (template_id, business_unit_id, location, conducted_by, status, score, critical_failures, reviewed_by, summary)
- `safety_audit_run_responses` (run_id, item_id UNIQUE, answer, score, notes, evidence_path, auto_incident_id)
- Enums: `safety_audit_run_status` (draft|submitted|reviewed), `safety_audit_answer` (yes|no|na)

## RPCs
- `submit_audit_run(p_run_id)` — computes weighted score (yes=full, no=0, na=excluded), counts critical failures, auto-creates a `safety_incident` per critical "No" (links via `auto_incident_id`), transitions draft→submitted. Returns `{ ok, score, critical_failures }`.
- `mark_audit_reviewed(p_run_id, p_summary)` — submitted→reviewed, stamps `reviewed_by/at`.
- BEFORE UPDATE trigger `safety_audit_runs_block_status_writes` blocks direct status mutations outside the RPCs.

## Frontend SSOT (`src/lib/safetyAudits.ts`)
- `computeAuditScore(pairs)` — mirrors RPC math; returns 0-100 rounded to 2dp, NA fully excluded.
- `countCriticalFailures(pairs)`, `validateAuditSubmission(pairs)` — UI guards.
- `complianceBand(score)` — excellent ≥90, good ≥75, fair ≥60, poor <60. Used by scoreboard tones.
- All labels/tones (status, answer, category) live here — never hardcode in components.

## UI surfaces
- `/safety/audits` — hub with active runs + recent reviewed.
- `/safety/audits/templates` — admin editor (template + item rows with weight/critical/evidence flags).
- `/safety/audits/runs/new` — start wizard (pick template + scope).
- `/safety/audits/runs/:id` — runner: per-item Yes/No/NA + notes + evidence; live score preview via `computeAuditScore`; submit calls RPC.
- `/safety/audits/scoreboard` — BU rollup grouped by `complianceBand`.

## Cache & realtime
- All keys under `['safety','audits',...]`. Realtime invalidation in `useSafetyRealtimeSync` covers all 4 tables.

## Tests (`src/test/safetyAudits.test.ts`, 11/11)
Covers enum integrity, scoring math, critical-fail counting, submission validation, and band thresholds.
