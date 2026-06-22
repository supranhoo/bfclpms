# Fix: "Only title/description may be edited on an observation" when Mark Resolved

## Root Cause (RCA)

The `Mark Resolved` button on `kpi_observations` is shown only to the observation raiser (`isRaiser` in `ObservationReplyThread.tsx`). The hook `useResolveObservation` performs:

```ts
supabase.from('kpi_observations').update({ status: 'resolved' }).eq('id', observationId)
```

But the BEFORE UPDATE trigger `guard_observation_self_edit` (migration `20260528034544`) explicitly blocks the creator (`auth.uid() = OLD.created_by`) from changing **any** field other than `title`/`description` — including `status`. So when Ayush (the auditor who raised the observation) tries to resolve their own observation, the trigger raises:

> Only title/description may be edited on an observation

This is a **policy/trigger bug**, not an RLS issue. The UI intent (raiser can resolve) contradicts the trigger.

## Risk & Impact Report

- **Data Impact**: Schema unchanged. Only the trigger function `guard_observation_self_edit` is replaced (CREATE OR REPLACE). Additive, fully reversible.
- **Workflow Impact**: Restores intended behavior — the raiser can mark their own observation as `resolved` (and undo to `open`). All other workflow fields (`score_impact`, `is_applied`, `visibility`, `observation_type`, `observer_role`, `ticket_number`, `reviewed_by`, `reviewed_at`, evidence) remain locked for the creator path.
- **UI/UX**: No visual change. The error toast simply stops appearing; the existing success toast fires.
- **Regression Risk**: Low. Trigger continues to block all the fields it blocked before, except status (limited to `open ↔ resolved` transitions by the creator). `resolved_at` / `resolved_by` allowed to be set alongside.
- **Mitigation**: Vitest unit test asserting the resolve mutation issues `update({ status: 'resolved' })` only; manual verify via Mark Resolved button.

## Plan

1. **New migration** that `CREATE OR REPLACE`s `public.guard_observation_self_edit` to:
   - Continue blocking creator edits on `observer_role`, `observation_type`, `score_impact`, `is_applied`, `visibility`, `ticket_number`, `reviewed_by`, `reviewed_at`, evidence fields, immutable keys (`kpi_id`, `created_by`, `created_at`).
   - **Allow** `status` transitions by the creator only between `open` and `resolved` (raise otherwise).
   - **Allow** `resolved_at` / `resolved_by` changes when paired with a `status` change.
   - Keep the existing `edited_at` bump on title/description changes.
2. **Hook hardening** (`useResolveObservation`): also send `resolved_at: new Date().toISOString()` and `resolved_by: user.id` (and the open-toggle path if applicable) so audit fields are populated. No UI change.
3. **Unit test** in `src/test/` mocking supabase to assert the update payload shape.
4. **Docs**: Append a note to `mem://features/review/kpi-observations-system` clarifying "raiser may resolve own observation".

## Files Touched

- `supabase/migrations/<new>_fix_observation_self_resolve.sql` (new)
- `src/hooks/useObservationReplies.ts` (extend update payload with `resolved_at`/`resolved_by`)
- `src/test/observationResolve.test.ts` (new)
- `mem://features/review/kpi-observations-system` (note)

## Rollback

Drop the new migration / re-apply the previous trigger body. No data migration involved.
