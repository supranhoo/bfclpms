# Safety Module Performance CAPA Plan

Audit covers code shipped over the last ~2 days (Incident Types + Severity values, Involved Person column, backup CAPA-1). Diagnosis-first per the performance-optimization skill — no blind fixes.

## Assumptions
- Active incident volume will grow into thousands within 12 months; current sizing tolerates today's gaps but won't scale.
- POLICY §113 / ADR-050 (Safety Manual-Fetch & Pagination) is the canonical contract.
- No UI redesign requested — fixes stay behind existing primitives.

## Risk & Impact Report
- **Data:** No schema changes. Read-path only, except GAP-7 (batch severity reorder) which is an additive RPC.
- **Workflow:** None — same screens, same filters, same buttons.
- **UI/UX:** GAP-5 swaps custom Permits filter/table for canonical `SafetyFilterBar`/`SafetyDataTable` — visual parity expected, minor spacing diffs possible.
- **Regression:** Highest on GAP-1/2 (SLA queue card + KPI drill-down) and GAP-10 (scoped invalidation). Mitigation: extend `safetyManualFetch.test.tsx` + add unit tests for the new scoped queries + manual smoke on SafetyHome/SLA queue.
- **Scalability:** All four High fixes remove O(N) scans of the incidents table from the hot path.

## Findings Summary

| # | File | Severity | Issue |
|---|---|---|---|
| 1 | `useSafetyIncidents.ts` | High | Unbounded `select('*')`, no `.range()`, auto-fires on mount |
| 2 | `SafetySlaQueueCard`, `KpiDrillDownDialog` | High | Client-side filter of GAP-1's result set; re-runs every 30s |
| 3 | `SafetyIncidents.tsx` | High | Profiles join runs on every page fetch, even when type ≠ Accident |
| 4 | `useSafetyAssets.ts` | High | `.limit(1000)` + client-side calibration-bucket filter |
| 5 | `SafetyPermits.tsx` | Med | Custom filter/table instead of canonical primitives |
| 6 | `useSafetyTraining.ts` | Med | Hardcoded `.limit(500/2000)` on SOPs + assignments |
| 7 | `useReorderSafetyIncidentSeverities` | Med | Sequential N UPDATEs in a `for` loop |
| 8 | `SafetyIncidentTypes.tsx` SeverityManager | Med | N concurrent severity fetches when N rows expanded |
| 9 | `SafetyHome.tsx` realtime sync | Med | Subscribes to all 20 safety tables; over-invalidates |
| 10 | `useSafetyIncidents` mutations | Med | Invalidates entire `['safety']` root cache |
| 11 | `SafetyTrendChart` recharts import | Low | Static import — safe today, fragile if reused outside `/analytics` |
| 12 | `useSafetyIncidentTypes` `select('*')` | Low | No explicit column list on reference tables |

## Step-by-Step Plan (in priority order)

### Wave 1 — High-severity (blocks scale)

1. **GAP-1 + GAP-2 — Scope the incidents hot path**
   - Refactor `useSafetyIncidents()` to be `useSafetyIncident(id)` (single-row only). Mark list usage as forbidden in policy memory.
   - `SafetySlaQueueCard`: replace with a new `useSafetySlaQueue()` that runs `select('id, ref_code, title, sla_state, due_at, assigned_to').neq('status','closed').in('sla_state',['red','amber']).order('due_at').range(0, 24)` — ranked queue, 25 rows.
   - `KpiDrillDownDialog`: replace with parameterised count/list RPCs already exposed (`safety-analytics` edge function) or scoped paged queries keyed on the KPI.
   - **Verify:** new vitest covering the scoped query keys; manual: open SafetyHome → SLA tile → confirm same rows render; open any KPI tile → drill-down still works.

2. **GAP-3 — Conditional profiles hydration in incidents fetcher**
   - Pass `typeId` + resolved `typeName` into `fetchIncidentsPage`. Skip the `profiles` IN-query unless `/accident/i.test(typeName)`.
   - **Verify:** network tab — filtering by non-Accident type fires 1 request (incidents), not 2.

3. **GAP-4 — Server-side calibration bucket filter**
   - Push `calibrationBucket` logic into a `.gte()/.lte()` on `next_calibration_at` (overdue / due-30 / due-90 / ok). Convert to `useManualQuery` and remove `.limit(1000)`.
   - Leave `SafetyAssetDetail.tsx` consumer using a single-row variant.
   - **Verify:** vitest for bucket→date-range mapping; manual: each bucket filter returns same counts as before.

### Wave 2 — Medium-severity (housekeeping)

4. **GAP-10 — Scope mutation invalidations** in `useSafetyIncidents` to `['safety','incidents']`, `['safety','dashboard-stats']`, `['safety','audit-log']` only.
5. **GAP-9 — Scope `useSafetyRealtimeSync` on SafetyHome** to `['safety_incidents','safety_sla_escalations','safety_permits','safety_audit_runs']`.
6. **GAP-7 — Single-RPC severity reorder.** New `reorder_safety_incident_severities(p_type_id uuid, p_ids uuid[])` SECURITY DEFINER function. Replace N-loop client side.
7. **GAP-8 — Lazy-mount SeverityManager**: verify conditional render unmounts on collapse; if not, gate behind expansion state.
8. **GAP-5 — Permits page primitives swap** to `SafetyFilterBar` + `SafetyDataTable`. Visual parity only.
9. **GAP-6 — `useSafetyTraining` migration** to `useManualQuery` + `.range()`. SOP admin + assignment admin only; member-facing "My Assignments" can keep a `.range(0,49)` cap if list stays bounded by RLS.

### Wave 3 — Low (deferred unless trivial)
- **GAP-11 + GAP-12** addressed inline during Wave 1/2 edits to touched files.

## UI Changes
- **SafetyPermits page** (GAP-5): filter bar and table swap to canonical primitives. Same fields, same columns, same buttons — only chrome alignment changes.
- **SafetyAssets calibration filter** (GAP-4): no visual change; same dropdown, same results.
- All other waves are data-layer only.

## Tests
- New: `src/test/safety/sla-queue-scoped.test.tsx` (GAP-2), `src/test/safety/incidents-profiles-skip.test.tsx` (GAP-3), `src/test/safety/assets-calibration-bucket.test.ts` (GAP-4), `src/test/safety/severity-reorder-rpc.test.ts` (GAP-7).
- Extend `src/test/safetyManualFetchPages.test.ts` to include SafetyPermits primitive imports.

## Documentation Updates
- `DOCUMENTATION.md` — new v2.66.16 entry summarising the 4 high-priority fixes and measured impact (queries-per-mount, payload bytes).
- `POLICY.md` §113 — clarify that listing hooks (`useSafetyXxx()` returning arrays) must be migrated to `useManualQuery`; single-row hooks exempt.
- `mem://architecture/safety/manual-fetch-and-pagination.md` — add the migrated pages (Permits, Assets calibration), and the new "list hooks must follow §113" clause.

## Rollback Strategy
- Each wave is a separate commit. Wave 1 fixes are pure additions of new scoped hooks; the deprecated `useSafetyIncidents()` list overload stays as a re-export shim for one release before deletion.
- GAP-7 RPC is additive; client falls back to N-loop if RPC absent.

## Decision Justification
- Chose **scoped queries** over a global `SafetyRealtimeSync` rewrite because the realtime channel is shared infra; narrowing per-page subscriptions is safer than re-architecting the bus.
- Chose to **deprecate, not delete**, `useSafetyIncidents()` list usage to keep external imports compiling while we migrate consumers.
- Did **not** propose recharts/jspdf code-splitting work — audit shows it's already correctly lazy-loaded at the route level (GAP-11 is preventive, not corrective).

## Out of Scope
- CAPA-2 (chronic Batch 46 OOM, row-level streaming for the largest backup tables) — tracked separately.
- General PMS performance — only touched if a shared utility is changed.

Approve to proceed with **Wave 1** first; Waves 2 and 3 will follow in separate commits with their own verification.
