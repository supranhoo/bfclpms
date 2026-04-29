---
name: Safety Training & SOPs (Phase 3)
description: Training & SOP lifecycle, SSOT, RPC-only status moves, server-side scoring, and overdue cron
type: feature
---
# Safety Training & SOPs (Phase 3)

## Lifecycle
`pending → in_progress → passed | failed | overdue`. `passed` and `overdue` are terminal. Status writes go through RPCs only — a BEFORE UPDATE trigger blocks direct writes (`safety.training_fsm` session flag bypasses it).

## RPCs (all return `{ ok, error?, result? }`)
- `assign_sop_to_role(_sop_id, _role, _business_unit_id?, _due_in_days?)` — bulk-creates one assignment per active user with that Safety role; ON CONFLICT skips duplicates.
- `start_training_attempt(_assignment_id)` — returns shuffled questions WITHOUT `correct_index`; flips assignment to `in_progress` and increments `attempts_count`.
- `submit_training_attempt(_attempt_id, _answers, _reading_seconds)` — server-scores, enforces `min_read_seconds`, sets `passed | failed | (in_progress for retry)`.
- `mark_overdue_training_assignments()` — flips past-due `pending|in_progress` to `overdue`. Called by `training-overdue-sweep` edge fn (daily 02:00 UTC, cron `training-overdue-sweep-daily`).

## Security
- `safety_quiz_questions` has NO worker-readable RLS policy. The correct answer can only reach the client via the explicit RPC, which strips `correct_index` from the payload.
- All RPCs are SECURITY DEFINER with `SET search_path = public`.

## SSOT files
- `src/lib/safetyTraining.ts` — statuses, labels, tones, `canStartAttempt`, `formatDueIn`, validators.
- `src/hooks/useSafetyTraining.ts` — React Query hooks for SOPs, quiz, questions, assignments, attempts, RPC mutations.
- `src/components/safety/TrainingStatusBadge.tsx` — badge driven by SSOT tone map.

## Routes
- `/safety/training` — worker page (list → reader with scroll-locked timer → quiz runner).
- `/safety/training/admin` — admin page (SOP CRUD, quiz builder, question editor, role assignment, compliance overview).

## Tests
`src/test/safetyTraining.test.ts` (14 tests): enum integrity, label/tone coverage, terminal predicate, `canStartAttempt` matrix, `formatDueIn` (overdue/days/hours/minutes), `isValidPassThreshold`, `isValidMinReadSeconds`.

## Realtime
`safety_training_assignments` and `safety_training_attempts` are in `supabase_realtime` and wired into `useSafetyRealtimeSync` (`training` group → invalidates `['safety','training']` + dashboard stats).