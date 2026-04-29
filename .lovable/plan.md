# Safety Module — Manual Fetch & Pagination Policy

Codify and retrofit a single rule across `/safety/*`: **filters first → click to load → paginated tables**. No list/query screen may auto-fetch on mount, and no table may render an unbounded result set.

## 1. Policy & SSOT (codify once, applies forever)

Create the binding rule so all future Safety work follows it automatically:

- **`POLICY.md` §113 — Safety Manual-Fetch & Pagination**
  - List/query screens MUST NOT auto-fetch on mount. A visible **Search** (filter screens) or **Load** (pure list screens) button triggers the query.
  - Detail screens (`/:id`) and dashboard tiles that show a single aggregate are exempt — they auto-load.
  - All tabular surfaces MUST paginate server-side: default page size 25, options 25/50/100, with prev/next + page indicator. No screen may render more than one page worth of rows at a time.
  - Mutations (create / transition / approve) continue to invalidate caches and re-run the **last submitted** query — never silently re-issue different filters.
- **`DOCUMENTATION.md`** — add a "Safety UX Conventions" section pointing to §113 and listing the standard hook/component primitives below.
- **`mem://architecture/safety/manual-fetch-and-pagination`** — new memory file + index.md entry under Core ("Safety lists: manual fetch + paginated").
- **`docs/adr/ADR-050.md`** — Safety Manual Fetch & Pagination ADR (context, decision, consequences, migration plan).

## 2. Reusable primitives (the SSOT for every Safety list)

Add in `src/components/safety/` and `src/hooks/`:

- **`useManualQuery<T>(queryKey, fetcher, { pageSize })`** — wraps React Query with `enabled: false`, exposes `submit(filters)`, `page`, `setPage`, `pageSize`, `setPageSize`, `hasSubmitted`, `isFetching`, `rows`, `total`. Internally does range-based fetch (`.range(from, to)`) + `count: 'exact'`.
- **`<SafetyFilterBar>`** — slot wrapper with a right-aligned **Search** primary button + **Reset** secondary. Disables Search while a query is in flight; emits `onSubmit(filters)` only on click / Enter inside an input.
- **`<SafetyDataTable>`** — thin wrapper over the existing `Table` adding: empty/loading/"Click Search to load" states, sticky pagination footer (`Page X of Y · 25/50/100`), and a `total` count badge.
- **`<SafetyEmptyState variant="awaiting-search" | "no-results">`** — replaces today's bare "No data" rows.

These three primitives are the only sanctioned way to build a Safety list going forward; the policy memory references them by name.

## 3. Retrofit existing Safety screens

Convert each list page below to: mount-time renders filter bar + empty "Apply filters and click Search" state; data + pagination only after Search.

| Screen | Current behavior | Change |
|---|---|---|
| `SafetyIncidents.tsx` | Auto-fetches all incidents, client-side search | Filter bar (status, severity, type, date range, text) → Search → paginated server query |
| `SafetyPermits.tsx` | Auto-fetches, groups Live/History | Filter bar (status, type, text, date range) → Search → paginated; keep Live/History as a tab toggle within results |
| `SafetyAudits.tsx` | Auto-loads runs + templates | Search button drives runs query; templates list also paginates (25/page) |
| `SafetyAuditTemplates.tsx` | Auto-loads | Filter (active, search) → Search → paginated |
| `SafetyAuditScoreboard.tsx` | Auto-aggregates | Period + BU filter → Search → paginated BU rows |
| `SafetyAssets.tsx` | Auto-loads | Filter (type, status, calibration band, BU, text) → Search → paginated |
| `SafetyTraining.tsx` / `SafetyTrainingAdmin.tsx` | Auto-loads | Filter (status, course, employee, BU) → Search → paginated |
| `SafetyEmergency.tsx` (drills list) | Auto-loads | Filter (status, BU, date range) → Search → paginated |
| `SafetyEmergencyContacts.tsx` | Auto-loads | Filter (BU, role, text) → Search → paginated |
| `SafetyAuditLog.tsx` | Auto-loads 300 rows | Filter (entity, event, performer, date range, text) → Search → paginated (no implicit 300-row cap) |
| `SafetySlaMonitor.tsx` | Auto-loads | Filter (state, severity, owner) → Search → paginated |
| `SafetyHoursWorked.tsx` | Auto-loads | Filter (BU, year/month range) → Search → paginated |
| `SafetyUsers.tsx` | Auto-loads roles/access | Filter (role, BU, text) → Search → paginated |
| `SafetyAnalytics.tsx` | Auto-loads dashboard | **Exempt as dashboard**, but the BU drill-down table inside it switches to manual-search + paginated |
| `SafetyHome.tsx` | Tiles + small recent lists | Tiles stay auto; embedded "Recent" lists become "Open queue →" links instead of inline data |

Detail pages (`*Detail.tsx`), `New` forms, and `SafetySettings.tsx` are unchanged.

## 4. Hook layer changes

Update list-returning hooks to support manual + paginated mode (back-compat by accepting `{ enabled: false }` and `{ page, pageSize }`):

- `useSafetyIncidents`, `useSafetyPermits`, `useAuditRuns`, `useAuditTemplates`, `useSafetyAssets`, `useSafetyTraining`, `useSafetyEmergency` (drills/contacts), `useSafetyAuditLog`, `useSafetyAnalytics` (BU drill-down only).
- All switch to range queries with `count: 'exact', head: false`, returning `{ rows, total }`.
- Cache key includes the **submitted** filters + `page` + `pageSize`; in-flight typing in the filter bar does not change the key until Search is pressed.

## 5. Tests (regression protection)

- **`src/test/safetyManualFetch.test.tsx`** — mounts each list page, asserts:
  1. No network call fires before clicking Search.
  2. Empty-state copy "Apply filters and click Search" is shown on mount.
  3. Clicking Search dispatches exactly one query with the expected filters + `range(0, 24)`.
  4. Pagination controls render `Page 1 of N` and advance the range on next-page click.
- **`src/test/safetyPagination.test.ts`** — pure logic tests for `useManualQuery` (range math, page bounds, pageSize change resets to page 1, mutation re-runs last submitted query).
- Existing 125 safety tests continue to pass.

## 6. Risk & Impact Report

- **Data Impact:** none — read-side only; no schema, no RLS changes.
- **Workflow Impact:** users now click Search to see lists. Mitigation: clear empty-state copy + auto-focus first filter; Enter key in any filter input also submits.
- **UI/UX Consistency:** all Safety lists adopt the same filter-bar/table/pagination primitives — *more* consistent, not less.
- **Regression Risk:** medium (touches every list page + hooks). Mitigated by (a) hooks remaining backward-compatible until each page is migrated, (b) the new test file gating every page, (c) per-page migration in small commits.
- **Performance:** strictly improves cold-load — `/safety/incidents`, `/safety/permits`, `/safety/audit-log` no longer pull full tables on mount.

## 7. Rollout order

1. Land policy docs + ADR + memory + primitives + `useManualQuery` (no UI change yet).
2. Migrate `SafetyAuditLog` (highest payoff, currently fetches 300 rows).
3. Migrate `SafetyIncidents`, `SafetyPermits`, `SafetyAudits` + `SafetyAuditTemplates`.
4. Migrate `SafetyAssets`, `SafetyTraining(+Admin)`, `SafetyEmergency`, `SafetyEmergencyContacts`, `SafetySlaMonitor`, `SafetyHoursWorked`, `SafetyUsers`, `SafetyAuditScoreboard`, analytics drill-down.
5. Add the manual-fetch test suite; update DOCUMENTATION Version History.

After approval I'll execute the rollout in that order.
