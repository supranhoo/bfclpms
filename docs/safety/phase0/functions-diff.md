# Edge Functions Diff

## Authoritative edge functions

| Function | Trigger | Auth posture | Notes |
|---|---|---|---|
| `check-safety-sla` | Cron | Service-role only (cron). Should reject unauthenticated calls. | Calls `run_safety_sla_escalations`. |
| `grant-safety-role` | UI (admin) | Requires caller with Safety admin role; verified server-side. | Writes `safety_user_roles` + `log_safety_role_change`. |
| `safety-analytics` | UI (any Safety role) | Verifies session + role; reads materialized data via `refresh_safety_analytics`. | Read-only contract. |

## Prototype-derived candidates

| Function | Disposition | Phase |
|---|---|---|
| `safety-bulk-import` (dry-run + commit) | **Accept** | 6 |
| `safety-notify-responder` (overlay) | **Conditional** — only if existing notification channel cannot carry payload | 5 |

## Stop conditions

- Any edge function added without explicit auth check.
- Any new function that mutates incident/permit status outside the RPC contracts in `rpc-diff.md`.