---
name: Import & edge-function error transparency (ADR-202)
description: supabase.functions.invoke hides non-2xx bodies; always use extractFunctionError(). Edge functions must log every non-2xx. Employee categories are company-scoped and pre-flight must mirror that rule.
type: feature
---

`supabase.functions.invoke()` returns `data = null` and the placeholder
message "Edge Function returned a non-2xx status code" on any non-2xx; the
real JSON body sits on `error.context` (a `Response`). Never surface
`fnError.message` directly — use `extractFunctionError(fnError, fnData)`
from `src/lib/edgeFunctionError.ts`.

Every non-2xx return in an edge function MUST log the subject and the
offending value first. `create-employee` emits
`[create-employee] REJECT <status> code=… …`.

`public.employee_categories` rows are company-scoped (all current rows are
bound to BFCL; Saibal and Aruna Industries have none). `create-employee`
accepts a category only when it is global (`company_id IS NULL`) or matches
the row's company — the importer pre-flight in `ImportData.tsx` mirrors that
rule, so a name-only check is a regression.

Regression: `src/test/edgeFunctionError.test.ts`,
`src/test/importCategoryCompanyScope.test.ts`.
