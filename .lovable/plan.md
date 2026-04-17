

## RCA: Real Cause of "No active employees resolved" Toast

### The actual bug (verified against live DB)

The edge function `compute-monthly-incentives/index.ts` selects a column that **does not exist** on `profiles`:

```ts
// Line 145
const empSelect = 'id, full_name, employee_code, department_id, designation, pms_grade, level, location';
```

I verified the live `profiles` schema — it has no `location` column. PostgREST returns an error like *"column profiles.location does not exist"*, but the call is destructured as:

```ts
const { data } = await supabase.from('profiles').select(empSelect)...
if (data) allEmployees.push(...data);
```

`error` is never checked. `data` comes back `null`, `allEmployees` stays `[]`, and execution falls into the "No active employees resolved" branch (line 176-181) — which is the exact toast in screenshot 705.

This explains why **every** previous fix appeared to work in isolation but the user kept seeing zero records: none of the earlier patches touched the SELECT clause, and the silent error prevented any of the new diagnostics, sub-period logic, or company-resolution improvements from ever running.

### Why earlier RCAs missed it
Previous rounds focused on:
- Period filter shadowing (real, but downstream)
- Full-Month vs sub-period storage (real, but downstream)
- Company resolution parity (real, but downstream)

All of those are *after* the employee fetch. The fetch itself was failing silently, so none of those branches were ever reached.

### Fix (single, minimal change)

**File:** `supabase/functions/compute-monthly-incentives/index.ts`

1. **Remove `location` from `empSelect`** (line 145):
   ```ts
   const empSelect = 'id, full_name, employee_code, department_id, designation, pms_grade, level';
   ```

2. **Pass `null` for `emp.location`** in slab matching (line 454):
   ```ts
   [slab.location, null],
   ```
   (Confirmed: zero slabs in the DB currently use `location`, so this is a no-op for live data. If the column is added later, it can be re-wired through `departments`/`business_units` instead.)

3. **Surface the real error** going forward — change both batched and unbatched profile fetches to check `error` and return a 500 with the PostgREST message instead of silently producing `[]`. This guarantees that any future schema/select mismatch is visible immediately rather than masquerading as "No active employees resolved".

### Documentation/policy sync (per project rules)
- `DOCUMENTATION.md` — add a Version History entry: *"Compute engine no longer references non-existent `profiles.location`; PostgREST errors now surface as 500 instead of silent zero-result."*
- `POLICY.md` — add a one-line rule under engine governance: *"Edge functions must check the `error` field on every Supabase query; silent destructuring of `data` is forbidden."*
- `docs/adr/ADR-044.md` — note the silent-error class as a regression class.

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Slab matching's `location` predicate previously evaluated against `undefined`; replacing with explicit `null` is identical for the 4 existing slabs (none use `location`). |
| Workflow | Compute will now actually return real records for Saibal Kunar / Metal Sizing / 1-10 April 2026 (~69 employees, 3 with positive day-1-10 totals based on prior diagnostics). |
| UI/UX | Toast will switch from misleading "No active employees resolved" to real diagnostics already wired in earlier rounds. |
| Regression | Very low — single-column removal in one SELECT, plus added error checks. |
| Mitigation | Add Deno test that mocks an invalid SELECT and asserts the function returns 500 with the PostgREST message, not a 200/zero-result. |

### Files Touched
- `supabase/functions/compute-monthly-incentives/index.ts` (remove `location` from SELECT, pass `null` in slab match, add `error` checks on profile fetches)
- `DOCUMENTATION.md`, `POLICY.md`, `docs/adr/ADR-044.md` (sync)
- `supabase/functions/compute-monthly-incentives/_test.ts` (silent-error regression guard)

### Out of Scope
- Adding a real `location` column/relationship (no slab uses it yet)
- Touching any other compute branch (sub-period, company resolution, diagnostics) — earlier fixes will start working as soon as the employee fetch succeeds

