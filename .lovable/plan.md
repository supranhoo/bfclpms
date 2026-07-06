## Why Remove looks non-functional

`TemplateEmployeesDialog` disables the row-level Remove button whenever the employee has no `annual_review_instances` row for the active cycle:

```
disabled={!canRemove || instancesQ.isLoading}
// canRemove = !!instancesQ.data?.get(r.employee.id)
```

The current cycle shows **Seeded: 250 / 2579**, so for CPP-W-Mech's 39 mapped employees almost none have a seeded instance yet. Every row therefore renders the red Remove button in a permanently disabled state. The only feedback is the `title` tooltip ("No seeded instance yet — seed the cycle first") which is easy to miss — hence "not functional".

The template-override RPC (`set_annual_review_template_override`) takes an `instance_id`, so removal genuinely cannot be recorded until an instance exists.

## Fix

Make the dialog self-healing: seed the missing instance on demand at the moment the admin confirms Remove, and surface the unseeded state clearly instead of silently disabling.

### UX

1. **Row Remove button** — no longer hard-disabled when the instance is missing. Keep it disabled only while queries are in flight or when the row's employee has no template resolution at all.
2. **Unseeded badge** — for rows without an instance, show a small amber "Not seeded" chip next to the name so the admin knows a seed will happen on confirm.
3. **Confirm panel copy** — when the pending row is unseeded, add one line: *"This employee isn't seeded yet. Confirming will seed their instance for this cycle and then apply the removal."*
4. **Dialog-level banner** — if any mapped rows are unseeded, show a single amber banner above the table:  *"N of M mapped employees are not seeded yet. Removal will seed them on the fly."* with a secondary button **Seed missing now** that runs `seedInstancesByRules` for the whole cycle (same call the Admin page uses) and refetches.
5. **Bulk hint unchanged** — the existing "Templates in use" row still opens this dialog; no changes to that surface.

### Removal flow (per-row Confirm)

```text
onConfirmRemove(row):
  1. instanceId = instancesQ.data.get(row.employee.id)
  2. if !instanceId:
       await svc.seedInstancesByRules({ cycleId, hrUserId: user.id })
       await instancesQ.refetch()
       instanceId = instancesQ.data.get(row.employee.id)
       if !instanceId: throw "Could not seed this employee. Check assignment rules."
  3. await svc.setTemplateOverride({ instanceId, templateId: null, reason })
  4. onChanged()   // parent invalidates coverage query
```

`seedInstancesByRules` is idempotent — it walks active rules and inserts/updates only what's missing — so calling it here is safe even if other rows are already seeded. It's the same function the "Seed instances" button on `/annual-review/admin` already invokes.

### Files

1. **`src/pages/annual-review/AnnualReviewFormMapping.tsx`** — only file touched.
   - `TemplateEmployeesDialog`: add `unseededCount` memo, banner + "Seed missing now" mutation (wraps `svc.seedInstancesByRules`), remove the hard disable on the row button, extend `remove` mutation to seed-then-override when the instance is missing, add the "Not seeded" chip, tweak Alert copy.
   - Thread `currentUser?.id` (already read for the parent page) into the dialog as `hrUserId` so the seed call has an actor. If it's not already in scope, source it from `useAuth()` at the dialog level.

No service, schema, RLS, or RPC changes. No changes to other panels.

## Risk & Impact

- **Data**: seed-on-demand uses the existing rule engine; every instance it creates would have been created by the normal "Seed instances" button anyway. Override write is unchanged.
- **Workflow**: admin now completes the removal in one click instead of hitting a dead button and hunting for the seed action on another screen.
- **UI/UX**: only additions — a banner, a chip, and a copy line in the confirm alert. No layout regressions.
- **Regression risk**: low. `EmployeeOverridePanel` (below the dialog) still keeps its own "seed cycle first" message and is untouched.
- **Scale**: `seedInstancesByRules` runs at cycle scope; large cycles (2500+) may take a few seconds, so the confirm button shows a spinner and the "Seed missing now" banner button is preferred when the admin wants to remove several rows in a row.

## Tests

- Extend `src/test/annualReview/*` (or add `templateEmployeesDialog.remove.test.ts`) with:
  - Row without instance → confirming Remove calls `seedInstancesByRules` then `setTemplateOverride` in order.
  - Row with instance → confirming Remove skips the seed call.
  - Seed returns no matching instance → mutation throws and surfaces the toast.

## Not Applicable

- DOCUMENTATION.md / POLICY.md: no policy change (removal semantics and audit trail are identical). A one-line changelog entry noting "Remove now seeds on demand" is enough.
