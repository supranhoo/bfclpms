# T-004 — Restrict `check-safety-sla` bypass to service-role only

**Severity:** Low–Medium  
**Phase:** Deferred (non-blocking)

## Problem

`check-safety-sla` currently treats `apikey === anonKey` as bypass.
Anon-key is a public value and should not grant cron-equivalent powers.

## Fix

Bypass only when `Authorization === Bearer <service-role>` or
`apikey === <service-role>`. Drop the anon-key branch.

## Verification

- Anon-key call: 401.
- Service-role call: 200.
- Admin JWT: 200 via role-check path.

## Resolution (2026-05-20)

`supabase/functions/check-safety-sla/index.ts` updated to remove the
`apiKey === anonKey` bypass branch. Function redeployed. Only
`Authorization: Bearer <service-role>` or `apikey: <service-role>`
counts as a service call; everything else falls through to JWT
admin/safety_head role validation.
