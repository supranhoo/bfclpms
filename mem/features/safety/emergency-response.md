---
name: Safety Emergency Response (Phase 6)
description: Drill scheduling/execution lifecycle, mustering, findings, and emergency contact directory
type: feature
---

## Schema (4 tables, 3 enums)
- `safety_emergency_drills` (drill_code UNIQUE, type, scenario, scheduled_at, started_at, completed_at, evacuation_seconds, score 0-100, status, summary)
- `safety_drill_participants` (drill_id, user_id, role, accounted_for, mustered_at, notes; UNIQUE drill_id+user_id)
- `safety_drill_findings` (drill_id, severity low|medium|high|critical, observation, corrective_action, owner_id, due_date)
- `safety_emergency_contacts` (name, role_title, phone_primary, phone_alt, email, contact_type, sort_order, is_active)
- Enums: `safety_drill_type`, `safety_drill_status`, `safety_emergency_contact_type`

## RPCs (lifecycle is RPC-only)
- `start_drill(p_drill_id)` — scheduled→in_progress, stamps started_at + conducted_by.
- `complete_drill(p_drill_id, p_evacuation_seconds, p_score)` — in_progress→completed, validates score 0-100 and seconds≥0.
- `review_drill(p_drill_id, p_summary)` — completed→reviewed; restricted to admin/safety_head/safety_officer.
- BEFORE UPDATE trigger `safety_drills_block_status_writes` blocks any direct status mutation outside the RPCs (uses `app.safety_rpc='on'` session flag).

## Frontend SSOT (`src/lib/safetyEmergency.ts`)
- Labels, tones, lifecycle predicates (`canStartDrill`/`canCompleteDrill`/`canReviewDrill`/`isTerminalDrillStatus`).
- `musterRate(pairs)` — % accounted-for, 2dp.
- `formatEvacuationDuration(seconds)` — `m:ss` (em-dash for null/invalid).
- `validateDrillDraft` / `validateContactDraft` — UI-side mirror of server checks.

## UI surfaces (`/safety/emergency/*`)
- `/emergency` — hub with status+type filters and drill list.
- `/emergency/drills/new` — schedule wizard.
- `/emergency/drills/:id` — detail with lifecycle actions (Start / Complete with seconds+score / Review with summary) + findings sub-form.
- `/emergency/contacts` — directory CRUD with confirm-destructive delete.

## Cache & realtime
- All keys under `['safety','emergency',...]`. `useSafetyRealtimeSync` subscribes to all 4 tables under group `emergency` (also nudges `dashboard-stats`).

## RLS
- Read: any safety role.
- Drill / participant / finding write: admin, safety_head, safety_officer, bu_head, supervisor.
- Drill delete: admin or safety_head only.
- Contact write: admin or safety_head only.

## Tests (`src/test/safetyEmergency.test.ts`, 16/16)
Enum integrity, lifecycle predicates, muster math, duration formatting, both validators.
