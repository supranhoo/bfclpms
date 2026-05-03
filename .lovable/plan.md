# Fix: KRA Rollover "Failed to send a request to the Edge Function"

## Root Cause
`supabase/functions/auto-rollover-kpis/index.ts` fails to boot:

```
Uncaught SyntaxError: Identifier 'supabaseUrl' has already been declared at index.ts:552
```

`supabaseUrl` is declared twice inside the same `Deno.serve` try-block:
- Line 168: `const supabaseUrl = Deno.env.get('SUPABASE_URL')!;` (used to create the supabase client)
- Line 533: `const supabaseUrl = Deno.env.get('SUPABASE_URL')!;` (re-declared before the email-notification fetch)

Because the module fails to compile, every invocation — preview, individual employee rollover, and "All Employees" — returns the generic "Failed to send a request to the Edge Function" toast seen in the screenshot.

## Fix
Remove the duplicate declaration at line 533. The outer `supabaseUrl` (line 168) is already in scope and can be reused for the `${supabaseUrl}/functions/v1/send-email-notification` fetch. Keep the `anonKey` declaration since it isn't declared elsewhere.

## Files
- `supabase/functions/auto-rollover-kpis/index.ts` — delete the duplicate `const supabaseUrl = ...` line inside the rolledOver loop block.

## Risk
Minimal. Pure syntax fix; no logic, schema, RLS, or workflow change. Restores rollover for both single-employee and All Employees modes.

## Verification
- Edge function boots cleanly (no more `worker boot error` in logs).
- "Check & Preview" returns preview data.
- Individual employee rollover completes and the consolidated notification + email path still receives the same `supabaseUrl`.
