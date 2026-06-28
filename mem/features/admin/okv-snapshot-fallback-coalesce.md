---
name: OKV submission-fallback coalesces over snapshot columns
description: useOrgKpiSubmissionFallback must coalesce achieved_value -> manager_achieved_value -> self_achieved_value and expose valueSource so /admin/org-kpi-data never silently shows "—" while the employee scorecard shows a snapshot value
type: feature
---

ADR-092 (2026-06-28). The Org KPI Data Entry row resolves a displayed value by:

1. OKV `achieved_value` (owner authoritative) — wins when non-NULL.
2. Else `useOrgKpiSubmissionFallback`, which coalesces `review_submissions.achieved_value -> manager_achieved_value -> self_achieved_value` in that priority and returns `valueSource ∈ { 'owner' | 'manager' | 'self' | 'none' }`.

**Rule.** Never read only `review_submissions.achieved_value` for the OKV fallback. After a rollback that keeps children past `kra_set` (POLICY §88 forbids touching their snapshots), only the manager/self columns hold the value the employee can see — and the OKV row will otherwise collapse to `—`, producing the same Y R V S Murthy / May 2026 mismatch.

**Files.**

- `src/hooks/useOrgKpiSubmissionFallback.ts` — only sanctioned coalescing site. Adding new readers MUST go through this hook.
- `src/test/orgKpiSnapshotFallbackCoalesce.test.ts` — 6 cases pin the priority, NULL behaviour, NA semantics, and the regression scenario.

**Forbidden.**

- Writing `self_achieved_value` / `manager_achieved_value` from propagation paths when the child is past `kra_set`. POLICY §88 immutability stands. The forced-resync RPC (deferred) is the only sanctioned write.
- Surfacing the coalesced value as "OKV truth" without consulting `valueSource`. When `valueSource !== 'owner'`, the badge MUST disambiguate "from snapshot" so admins do not mistake it for owner-entered data.
