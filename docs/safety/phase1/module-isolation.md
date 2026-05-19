# Module Isolation Validation

## Existing isolation test

- File: `src/test/safetyShellIsolation.test.tsx` (present).
- Status: not re-run in Phase 1 (build harness owns test runs). Last
  recorded run: passing per memory `mem://...` (PMS-shell parity).

## Static isolation greps

### PMS → Safety (must be empty)

```sh
rg -l 'from "@/(pages|components|hooks|lib)/safety' src \
  --glob '!src/{pages,components,hooks,lib,test}/safety/**'
# (no results)
```

✅ No PMS file imports Safety code outside the module gate.

### Safety → PMS business logic (must be empty)

Allowed cross-imports: `@/components/ui/*`, `@/lib/utils`,
`@/integrations/supabase/*`, `@/hooks/use-toast`, `@/hooks/use-mobile`,
self-references inside `safety/*`.

```sh
rg 'from "@/(pages|components|hooks|lib)/' src/{pages,components,hooks,lib}/safety \
  | rg -v '@/(components/ui|lib/utils|integrations|hooks/use-toast|hooks/use-mobile|components/safety|hooks/useSafety|lib/safety|pages/safety)'
# (no results)
```

✅ No Safety file imports PMS business logic.

## Route / sidebar isolation

- `SafetyLayout` mounts its own `SafetySidebar`; no PMS sidebar entries
  leak into `/safety/*`.
- `SafetyModuleRoute` wraps every `/safety/*` route in `App.tsx`.
- No PMS route renders any `Safety*` page.

## Cache namespace isolation

- All Safety React-Query keys begin with `'safety'`. No PMS query key
  begins with `'safety'`. No Safety hook invalidates a non-Safety key
  except the deliberate `['modules']` refresh in `useSafetyRoles`
  (documented in Phase 0 `cache-and-querykeys.md`).

## Result

✅ Module isolation is **GREEN**. No remediation required in Phase 1.
Recommended Phase 2 addition: a static ESLint rule banning the same
cross-imports the greps above forbid, so isolation regressions are
caught at lint time rather than test time.