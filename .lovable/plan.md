## Problem
In the "Reassign reviewer" dialog, typing an employee **code** (e.g. `101148`) returns "No matches". The search only queries `profiles.full_name` via `ilike`, so numeric employee codes never match.

## Fix (surgical, 1 file)
`src/components/annual-review/ReassignReviewerDialog.tsx` — extend the `people` query so search matches either the name or the employee code:

```ts
if (search.trim()) {
  const s = search.trim();
  q = q.or(`full_name.ilike.%${s}%,employee_code.ilike.%${s}%`);
}
```

No other logic, RPC, or RLS change needed — `employee_code` is already selected and RLS on `profiles` already allows reading active employees for authenticated users.

## Verification
- Open Reassign reviewer → Dept head → type `101148` → employee appears in "New reviewer" list.
- Type partial name → still works (regression check).
- Empty search → still shows first 100 active employees.

## Risk
Minimal — additive to a single client-side query. No schema, RLS, policy, or workflow changes.
