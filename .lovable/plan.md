

## RCA + CAPA: 401 Unauthorized on `bulk-zero-score-non-submitters`

### 1. Root Cause

The function `bulk-zero-score-non-submitters` is **missing from `supabase/config.toml`**. Without an entry, it defaults to `verify_jwt = true`, which causes the Supabase gateway to reject the request at the infrastructure level before the function code even runs.

All other admin edge functions (repair-orphaned-propagations, repair-stepped-back-siblings, etc.) have explicit `verify_jwt = false` entries in config.toml and handle auth internally via the shared `requireAdminUser()` helper.

The function's own auth code is correct — `requireAdminUser(req)` properly validates identity and admin role. But the gateway blocks the request before it reaches that code.

### 2. Evidence

- Logs show `[admin-auth] Identity validation failed: Auth session missing!` — this occurs because the gateway strips/rejects the token before forwarding
- Every other admin function in config.toml has `verify_jwt = false`
- The function was newly created and the config.toml entry was missed

### 3. Impact

- 100% of scan and execute attempts fail with 401
- Zero functionality — the entire Bulk Zero-Score feature is unusable

### 4. Corrective Action

Add to `supabase/config.toml`:

```toml
[functions.bulk-zero-score-non-submitters]
verify_jwt = false
```

This is consistent with all other admin functions that use `requireAdminUser()` for in-code auth.

### 5. Preventive Action

- Update `DOCUMENTATION.md` with a checklist: every new edge function must have a `config.toml` entry
- This is the third time a config.toml omission has caused a 401 — the pattern must be documented as a mandatory step

### 6. Files to update

| File | Change |
|------|--------|
| `supabase/config.toml` | Add `[functions.bulk-zero-score-non-submitters]` with `verify_jwt = false` |
| `DOCUMENTATION.md` | Add "New Edge Function Checklist" noting config.toml entry is mandatory |

### 7. Risk Assessment

- **Data impact**: None — config-only change
- **Regression risk**: Zero — adding a config entry cannot affect other functions
- **Security**: Maintained — the function enforces admin auth internally via `requireAdminUser()`

