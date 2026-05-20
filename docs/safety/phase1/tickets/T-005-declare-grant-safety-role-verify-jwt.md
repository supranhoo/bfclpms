# T-005 — Declare `verify_jwt` for `grant-safety-role`

**Severity:** Cosmetic  
**Phase:** Deferred (non-blocking)

## Problem

Function comment says `verify_jwt=false`, but `supabase/config.toml`
doesn't declare it. Behavior is correct (function performs own auth);
declaration should be explicit to prevent drift.

## Fix

```toml
[functions.grant-safety-role]
verify_jwt = false
```

## Resolution (2026-05-20)

Added explicit `[functions.grant-safety-role] verify_jwt = false` and
`[functions.check-safety-sla] verify_jwt = false` blocks to
`supabase/config.toml`. Runtime behavior unchanged — these functions
already validate auth in code.
