

# Grant Mentioned Users Read-Only KPI Access

## Overview

When a user is @mentioned in an observation (title, description, or reply), they will automatically receive read-only access to that specific KPI and its observations. This is implemented via a lightweight junction table and additive RLS policies.

## Architecture

```text
@mention triggers insert into kpi_mention_access
         |
         v
+----------------------------+
| kpi_mention_access         |
|----------------------------|
| id          (uuid, PK)     |
| kpi_id      (uuid, FK)     |
| user_id     (uuid, NOT NULL)|
| granted_by  (uuid)         |
| created_at  (timestamptz)  |
| UNIQUE(kpi_id, user_id)    |
+----------------------------+
         |
         v
RLS SELECT policy on "kpis" table:
  "Mentioned users can view KPI"
  USING (EXISTS (SELECT 1 FROM kpi_mention_access WHERE kpi_id = kpis.id AND user_id = auth.uid()))

RLS SELECT policy on "kpi_observations" table:
  "Mentioned users can view observations"
  USING (EXISTS (SELECT 1 FROM kpi_mention_access WHERE kpi_id = kpi_observations.kpi_id AND user_id = auth.uid()))

RLS SELECT policy on "kpi_observation_replies" table:
  "Mentioned users can view replies"
  USING (EXISTS (SELECT 1 FROM kpi_observation_replies r
    JOIN kpi_observations o ON r.observation_id = o.id
    JOIN kpi_mention_access m ON o.kpi_id = m.kpi_id AND m.user_id = auth.uid()))
```

## Changes

### 1. Database Migration

Create the `kpi_mention_access` table and add RLS policies:

- **New table**: `kpi_mention_access` with columns `id`, `kpi_id`, `user_id`, `granted_by`, `created_at`, and a unique constraint on `(kpi_id, user_id)`
- **RLS on `kpi_mention_access`**: Users can read their own access grants; authenticated users with observation-creation privileges can insert
- **New SELECT policy on `kpis`**: Allow users with a matching `kpi_mention_access` row to SELECT that KPI
- **New SELECT policy on `kpi_observations`**: Allow mentioned users to view observations on KPIs they have access to (public visibility only)
- **New SELECT policy on `kpi_observation_replies`**: Allow mentioned users to view replies on observations of accessible KPIs

The `kpi_mention_access` table uses `ON CONFLICT DO NOTHING` semantics so duplicate mentions don't error.

### 2. Update `src/hooks/useKpiObservations.ts`

In `useCreateObservation`, after inserting notifications for mentioned users, also insert rows into `kpi_mention_access`:

```
await supabase.from('kpi_mention_access').upsert(
  uniqueIds.map(userId => ({
    kpi_id: input.kpi_id,
    user_id: userId,
    granted_by: userData.user.id,
  })),
  { onConflict: 'kpi_id,user_id', ignoreDuplicates: true }
);
```

### 3. Update `src/hooks/useObservationReplies.ts`

In `useCreateObservationReply`, after inserting mention notifications, also insert `kpi_mention_access` rows for the mentioned users using the same upsert pattern.

### 4. Update `src/lib/inboxUtils.ts` (no change needed)

The existing deep-link logic for `observation_mention` already navigates to the KPI. With the new RLS policy, the mentioned user will now be able to view the KPI data when they arrive.

### 5. Update Documentation

Update `DOCUMENTATION.md` and `docs/rls-policies.md` to document:
- The new `kpi_mention_access` table
- The three new SELECT policies
- The access-grant flow triggered by @mentions

## Security Considerations

| Aspect | Detail |
|--------|--------|
| Scope | Read-only SELECT access only -- mentioned users cannot edit, delete, or change KPI status |
| Visibility | Observation access restricted to `visibility = 'public'` for mentioned users (internal observations remain hidden) |
| Revocation | Access persists until the row is deleted from `kpi_mention_access`; admins can manage via the table directly |
| Audit | `granted_by` and `created_at` columns provide a clear audit trail of who granted access and when |
| RLS on junction table | The table itself has RLS: users can only see their own grants; only users who can create observations can insert grants |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data exposure | Medium | Access is scoped to a single KPI, not the employee's entire scorecard; only public observations visible |
| Performance | Low | Simple EXISTS subquery on a small indexed table; unique constraint ensures no bloat |
| Privilege escalation | Low | INSERT policy on `kpi_mention_access` mirrors observation-creation privileges; cannot self-grant |
| Regression | None | Additive SELECT policies only; existing access paths unchanged |

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| DB migration | Create | New `kpi_mention_access` table + RLS + policies on `kpis`, `kpi_observations`, `kpi_observation_replies` |
| `src/hooks/useKpiObservations.ts` | Update | Insert `kpi_mention_access` rows when creating observations with mentions |
| `src/hooks/useObservationReplies.ts` | Update | Insert `kpi_mention_access` rows when creating replies with mentions |
| `DOCUMENTATION.md` | Update | Document mention-based access grants |
| `docs/rls-policies.md` | Update | Add new policies to RLS documentation |
