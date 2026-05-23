## 1. Root Cause Analysis

**Symptom:** Jaspal (admin) opens **Admin → All KRAs** and sees:
- Total Employees: 0, Total KPIs: 0, Completion Rate: 0%, "No employees found".
- Network shows **no failed request** — the calls succeeded but returned `[]`.

**Database reality:** 2,168 KPIs exist for May 2026; Jaspal has `admin` in `user_roles`; RLS policy `"Admins can manage all KPIs"` (`has_role(uid, 'admin')`) permits him to read all of them.

**Real cause (POLICY §96 — Auth-Readiness Query Gate):**
`useKpisByPeriod`, `useAllKpis`, `useKpisByPeriodRanges`, `useOpenQueryCounts`, and `useDistinctKpiPeriods` in `src/hooks/useKpis.ts` fire as soon as their input params exist:

```ts
enabled: !!selectedPeriod && !!selectedYear   // misses auth readiness
```

On a cold mount where Supabase has not yet rehydrated the session from `localStorage`, PostgREST receives the request **without a JWT**. With anon role, RLS returns 0 rows — *no error, just empty data* — which React Query then caches for `staleTime: 5 * 60_000` per the `['kpis-by-period', 'May', 2026]` key.

The `AuthContext` defense-in-depth invalidation (lines 264-287) already lists `['kpis']`, `['kpis-by-period']`, `['kpis-by-period-ranges']`, but **`['all-kpis']` is missing**, and the hooks themselves never wait for auth before firing — so the race window remains open. Jaspal's environment (slower hydration on his device/network) consistently lands inside that window.

This is the **exact same pattern** flagged in the Chandan Pandit Org-KPI blank-until-refresh bug (May 2026) and codified in `mem://architecture/auth-readiness-query-gate`.

## 2. Risk & Impact Report

| Dimension | Impact |
|---|---|
| **Data** | None. Read-only fix on existing tables. No schema/RLS/migration. |
| **Workflow** | None. Output unchanged for already-authenticated sessions. |
| **UI/UX** | Strictly positive — eliminates the blank-until-refresh state for every admin/auditor/HR-PMS/management user on All KRAs. |
| **Regression Risk** | **Low.** Hooks gain a strictly *narrower* `enabled` predicate (extra AND). No call-site changes required because `useQuery` already returns `isLoading: true` until enabled. |
| **Scalability** | Neutral. No extra requests; same query, just deferred by ≤ ~200ms. |
| **Mitigation** | Adds a unit test that asserts each hook is disabled when `isReady=false` or `user=null`. |

## 3. Fix Plan (Surgical, SSOT-aligned)

### 3.1 `src/hooks/useKpis.ts` (single file, additive)

Apply the canonical gate to every RLS-dependent KPI hook:

| Hook | New gate (added to existing `enabled`) | New query-key suffix |
|---|---|---|
| `useAllKpis` | `isReady && !!user?.id && options?.enabled !== false` | append `user?.id` |
| `useKpisByPeriod` | `isReady && !!user?.id && !!selectedPeriod && !!selectedYear` | append `user?.id` |
| `useKpisByPeriodRanges` | `isReady && !!user?.id && periodRanges.length > 0` | append `user?.id` |
| `useOpenQueryCounts` | `isReady && !!user?.id && kpiIds.length > 0` | append `user?.id` |
| `useDistinctKpiPeriods` | `isReady && !!user?.id` | append `user?.id` |

Standard pattern (no other hook body changes):

```ts
const { isReady, user } = useAuth();
return useQuery({
  queryKey: ['kpis-by-period', selectedPeriod, selectedYear, user?.id],
  enabled: isReady && !!user?.id && !!selectedPeriod && !!selectedYear,
  // …rest unchanged…
});
```

### 3.2 `src/contexts/AuthContext.tsx` (one line added)

Add the missing key to the not-ready → ready invalidation block (around line 270):

```ts
queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
```

Keeps parity with the already-invalidated `['kpis-by-period']`, `['kpis-by-period-ranges']`, etc., and protects users who navigated mid-bootstrap before the gate ships.

### 3.3 Out of scope (deliberately)

- No changes to `AllKpis.tsx`, RLS, or any other consumer.
- Other hooks in the project not exercised by this page (`useMyKpis`, `useTeamKpis`, etc.) are not retouched in this fix — separate audit/PR if needed.
- No UI text/layout changes.

## 4. Verification Steps

1. **Manual** — Hard-refresh Admin → All KRAs as Jaspal. KPIs render on first paint (no second refresh needed). Repeat in incognito + throttled "Fast 3G" to widen the race window.
2. **Existing matrix** — Confirm 2,168 KPIs for May 2026 appear, employees grouped, filters respond.
3. **Unit test** — Add `src/hooks/useKpis.authGate.test.ts` (vitest + `@testing-library/react`):
   - Mocks `useAuth` to return `{ isReady: false, user: null }` → asserts each hook's `query.fetchStatus === 'idle'`.
   - Switches to `{ isReady: true, user: { id: 'u1' } }` → asserts hook becomes enabled and fires the supabase mock.
4. **Network** — DevTools shows `/rest/v1/kpis` request fires only after `/auth/v1/user` resolves.

## 5. Rollback

Revert the two files. No DB or schema artifacts to roll back.

## 6. Memory & Docs

- Memory `mem://architecture/auth-readiness-query-gate` already documents the policy; no edit needed. The KPI hooks now comply.
- Append a one-line entry to `DOCUMENTATION.md` Version History: *"v2.66.x — KPI hooks gated on auth readiness (POLICY §96) — fixes blank All-KRAs dashboard race."*
- No `POLICY.md` change (no business-rule shift).
