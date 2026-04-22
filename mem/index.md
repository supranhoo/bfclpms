# Project Memory

## Core
Profiles list queries MUST use fetchAllPaged() — PostgREST caps unranged reads at 1000 rows; EmployeeCombobox and similar pickers cannot recover from truncated input. See mem://architecture/profiles-query-policy.

## Memories
- [Profiles query policy](mem://architecture/profiles-query-policy) — Mandatory paged fetch contract for all profile list/search/distinct-value queries
- [Copy KRAs Org KPI integrity](mem://features/admin/copy-kras-org-kpi-integrity) — Org KPI inheritance + paged employee picker
- [Org KPI management suite](mem://features/admin/org-kpi-management-suite) — Centralized data entry, inheritance, and governance
- [Data repair engine](mem://features/admin/data-repair-engine) — Three-phase managed data repair workflows
- [Universal scoring logic](mem://architecture/pms/universal-scoring-logic) — 8-stage scoring fallback chain
