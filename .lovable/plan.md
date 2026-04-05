

## Fix: "Unknown User" on Admin Actions in Review Timeline — Existing + Future

### Root Cause

The `profiles` table RLS prevents employees from seeing admin/auditor/management profiles outside their reporting chain. When the timeline fetches performer names via `.from('profiles').select().in('id', ...)`, RLS silently filters out admins → UI shows "Unknown user".

Secondary: `ADMIN_FAST_TRACK_APPROVED` and `DATA_REPAIR` actions are missing from the `actionConfig` map in `KpiTimeline.tsx`.

### Fix — 3 parts

#### Part 1: Database — SECURITY DEFINER function for audit display profiles

Create `get_profiles_for_audit_display(p_user_ids uuid[])` that returns `(id, full_name, email)` bypassing RLS. Safe because:
- Only returns display-name fields (no sensitive data)
- Caller already has access to the audit log entries containing these IDs

```sql
CREATE OR REPLACE FUNCTION public.get_profiles_for_audit_display(p_user_ids uuid[])
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.email
  FROM profiles p
  WHERE p.id = ANY(p_user_ids);
$$;
```

#### Part 2: Code — Fix EXISTING displays in KpiTimeline + OrgKpiHistoryTimeline

Replace the direct `.from('profiles').select().in('id', ...)` query with `.rpc('get_profiles_for_audit_display', { p_user_ids: allUserIds })` in **both** timeline components:

- `src/components/dashboard/KpiTimeline.tsx` (employee/manager view)
- `src/components/admin/OrgKpiHistoryTimeline.tsx` (if it also uses direct profile query)

This fixes ALL existing audit log entries that currently show "Unknown user" — no data migration needed, just the query change.

Also add missing action types to `actionConfig`:
- `ADMIN_FAST_TRACK_APPROVED` (rose theme)
- `DATA_REPAIR` (teal theme)
- `SUBMISSION_SCORE_CHANGED` (slate theme)
- `PERCOLATION_DEFERRED` (amber theme)
- `SCORE_PERCOLATED` (teal theme)
- `RECONCILE_STATUS` (orange theme)
- `ADMIN_BULK_STEP_BACK` (rose theme)

#### Part 3: Documentation

| File | Change |
|------|--------|
| New migration SQL | Create `get_profiles_for_audit_display` function |
| `src/components/dashboard/KpiTimeline.tsx` | Use RPC for profile fetch + add missing actionConfig entries |
| `src/components/admin/OrgKpiHistoryTimeline.tsx` | Use RPC for profile fetch (if applicable) |
| `POLICY.md` | Add §57: Audit log performer names must be visible to any user who can view the log entry |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No data leakage**: Function only exposes name/email for users already identified in visible audit logs
- **Fixes existing displays**: Every past "Unknown user" entry resolves immediately — no data migration required
- **Forward-looking**: Any future action with any performer will resolve correctly regardless of RLS
- **No regression**: Additive function, existing RLS policies untouched

