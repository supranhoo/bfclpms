# Database Documentation Set

Read-only current-state audit of the live schema. Generated 2026-07-28.

| Doc | Contents |
|---|---|
| [00 Executive overview](00-executive-schema-overview.md) | Census, headline findings, domain distribution |
| [01 Object inventory](01-object-inventory.md) | Index of the 24 machine-readable catalogs in `data/` |
| [02 Domain model](02-domain-model.md) | All 248 tables assigned to 9 domains |
| [03 Core ERD](03-erd-core.md) | Org + Monthly PMS/KPI |
| [04 Annual Review & Safety ERD](04-erd-annual-review.md) | Review state machine, Safety graph |
| [05 Workflow data flows](05-workflow-data-flows.md) | PMS, annual, safety, and the 14 cron jobs |
| [06 Security & RLS matrix](06-security-and-rls-matrix.md) | 736 policies, helper usage, gaps |
| [07 Data integrity audit](07-data-integrity-audit.md) | Keys, FK delete rules, lifecycle |
| [08 Performance audit](08-performance-audit.md) | Scan hotspots, indexes, pagination |
| [09 Schema drift report](09-schema-drift-report.md) | Live vs `types.ts` vs migrations vs code |
| [10 Gap & risk register](10-gap-and-risk-register.md) | 15 findings, severity-ranked |
| [11 Application usage map](11-application-usage-map.md) | Per-table and per-function usage classification |
| [12 Migration roadmap](12-migration-roadmap.md) | Sequenced remediation proposal |

**Source-of-truth hierarchy:** live database → `src/integrations/supabase/types.ts` → `supabase/migrations/` → application code → tests → POLICY/ADR → prose docs.

**Scope:** no migrations were run, no data was modified, no secrets were read. `data/*.csv` are raw catalog extracts and can be regenerated at any time.
