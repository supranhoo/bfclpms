# T-001 — REVOKE public reads on `mv_safety_*`

**Severity:** High (data exposure) — bounded to aggregates.
**Phase:** 1.5 (blocks Phase 2 sign-off)

## Problem

The 6 Safety materialized views are reachable via PostgREST because MVs
can't carry RLS. Any authenticated user can query them directly even
without a Safety role.

## Fix (additive migration)

```sql
revoke select on
  public.mv_safety_trir,
  public.mv_safety_severity_rate,
  public.mv_safety_incidents_open_vs_closed,
  public.mv_safety_training_compliance,
  public.mv_safety_audit_scoreboard,
  public.mv_safety_permit_throughput
from anon, authenticated;

grant select on the same list to service_role;
```

Update `safety-analytics` to use a service-role client gated by an
in-function `has_any_safety_role(auth.uid())` check.

## Verification

- Authenticated non-Safety user: direct REST query returns `permission denied`.
- Safety user via `safety-analytics`: rows returned.

## Rollback

Re-grant `select` to `authenticated`.
