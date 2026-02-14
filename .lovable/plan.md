

# Comprehensive Code Audit Report

---

## 1. CRITICAL FINDINGS (Immediate Blockers / Security Risks)

### 1.1 Edge Functions with `verify_jwt = false` -- Security Exposure

**Severity: HIGH**

Six edge functions have JWT verification disabled in `supabase/config.toml`. While some implement their own auth checks internally, this creates a wider attack surface:

| Function | Has Internal Auth? | Risk |
|---|---|---|
| `create-employee` | Yes (checks Bearer token + admin role) | Medium -- defense-in-depth missing |
| `create-backup` | Partial (only for `manual` type; `scheduled` bypasses auth entirely) | **HIGH** -- anyone can trigger a "scheduled" backup |
| `auto-rollover-kpis` | No auth check at all | **HIGH** -- anyone can trigger KPI rollover with arbitrary params |
| `password-rollout` | Needs verification | HIGH -- password reset for all users |
| `update-backup-schedule` | Needs verification | HIGH -- can modify backup schedule |
| `update-smtp-password` | Yes (checks Bearer token + admin role) | Medium |

**Recommendation**: Enable `verify_jwt = true` for all functions that are called from the frontend. For cron-triggered functions (`auto-rollover-kpis`, scheduled backups), add a shared secret check (e.g., `X-Cron-Secret` header) instead of leaving them completely open.

### 1.2 `auto-rollover-kpis` -- No Authentication

**File**: `supabase/functions/auto-rollover-kpis/index.ts`

This function uses the service role key directly with zero authentication. Any unauthenticated HTTP request can trigger a full KPI rollover across all employees. An attacker could:
- Duplicate KPIs across arbitrary months
- Corrupt review data by rolling over with `force: true`
- Target specific employees via `employee_ids` parameter

### 1.3 `create-backup` -- Scheduled Bypass

**File**: `supabase/functions/create-backup/index.ts` (lines 79-112)

When `backup_type` is not `manual`, all auth checks are skipped. An attacker can export the entire database (all tables listed in `TABLES_TO_BACKUP` including `profiles`, `user_roles`, `system_settings`) by sending `{"backup_type": "scheduled"}`.

---

## 2. DEAD CODE / ZOMBIE PAGES (Feature Debris)

### 2.1 Orphaned Full-Page Components (Ghost Features)

These pages exist as fully implemented components (hundreds of lines each) but are **never directly routed to** -- their routes in `App.tsx` redirect to `/dashboard`:

| File | Lines | Route | Redirects To |
|---|---|---|---|
| `src/pages/SelfReview.tsx` | ~997 lines | `/self-review` | `Navigate to="/dashboard"` |
| `src/pages/TeamReview.tsx` | ~362 lines | `/team-review` | `Navigate to="/dashboard?view=team"` |
| `src/pages/ManagementReview.tsx` | ~335 lines | `/management-review` | `Navigate to="/dashboard?view=management"` |
| `src/pages/AuditPanel.tsx` | ~345 lines | `/audit` | `Navigate to="/dashboard?view=audit"` |

These pages are lazy-loaded in `App.tsx` but their routes are `Navigate` redirects. The actual page code is **never rendered** -- it is pure dead weight (~2,039 lines total).

### 2.2 Orphaned Index Page

**File**: `src/pages/Index.tsx` (14 lines)

A boilerplate "Welcome to Your Blank App" page. It is not imported anywhere, not referenced in any route. Dead code.

### 2.3 Reference Files in `tmp/`

The `tmp/reference/` directory contains 6 reference component files. While not shipped to production (not imported), they add noise to the codebase.

### 2.4 Duplicate `use-toast` Hook

Two toast hook files exist:
- `src/hooks/use-toast.ts`
- `src/components/ui/use-toast.ts`

This creates import confusion and potential for divergent behavior.

---

## 3. ARCHITECTURAL GAPS

### 3.1 Race Condition in AuthContext

**File**: `src/contexts/AuthContext.tsx` (lines 63-83)

Both `onAuthStateChange` and `getSession()` run concurrently on mount. If `getSession()` resolves before the subscription fires, `setLoading(false)` is called twice, and `fetchProfile`/`fetchRole` can be invoked twice for the same user. The `setTimeout(() => {...}, 0)` is a workaround to avoid calling Supabase during the auth callback, but it doesn't prevent the duplicate fetch race.

**Recommendation**: Use a ref to track initialization and skip duplicate processing.

### 3.2 Missing Error Handling in Profile/Role Fetch

**File**: `src/contexts/AuthContext.tsx` (lines 45-58)

`fetchProfile` and `fetchRole` silently swallow errors. If the `profiles` or `user_roles` query fails (network issue, RLS misconfiguration), the user sees a forever-loading state or gets a null profile/role with no feedback.

### 3.3 `submissionMap` Recreated Every Render

**File**: `src/pages/SelfReview.tsx` (line 175)

```typescript
const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));
```

This creates a new `Map` on every render (not memoized), even though it depends on `submissions`. It should be wrapped in `useMemo`.

### 3.4 Console Warning: `CartesianAxis` Ref on Function Component

The console logs show a recurring warning from `CategoryScoreChart.tsx` where `CustomYAxisTick` is passed as a component but doesn't use `React.forwardRef()`. This is a non-breaking issue but produces console noise.

---

## 4. CLEANUP LIST (Specific Files to Delete/Modify)

### Files Safe to Delete

| File | Reason |
|---|---|
| `src/pages/SelfReview.tsx` | Route redirects; never rendered (~997 lines) |
| `src/pages/TeamReview.tsx` | Route redirects; never rendered (~362 lines) |
| `src/pages/ManagementReview.tsx` | Route redirects; never rendered (~335 lines) |
| `src/pages/AuditPanel.tsx` | Route redirects; never rendered (~345 lines) |
| `src/pages/Index.tsx` | Not imported or routed (~14 lines) |
| `tmp/reference/*.tsx` (6 files) | Development reference files, not imported |

### Imports to Remove from `App.tsx`

After deleting the above pages, remove these lazy imports from `App.tsx`:
- `SelfReview` (line not used since route is `Navigate`)
- `TeamReview` (same)
- `ManagementReview` (same -- though note it's not even lazy-imported currently since the route is a `Navigate`)
- `AuditPanel` (same)

### Duplicate File to Consolidate

- `src/components/ui/use-toast.ts` -- verify if it's identical to `src/hooks/use-toast.ts` and remove the duplicate.

---

## 5. REGRESSION RISK MAP

### High Risk Areas (Most Likely to Break)

| Area | Risk Factor | Why |
|---|---|---|
| **Workflow Engine** (`workflowEngine.ts`) | HIGH | Central to all review flows; recent changes added skip-level/HR PMS. Any status mapping error breaks the entire review pipeline. |
| **KpiDetailsTable.tsx** / **UnifiedScorecard.tsx** | HIGH | Recently modified to add `skip-level-review` and `hr-pms-review` view types. The cascading type union affects button visibility across all review levels. |
| **ImportData.tsx** | HIGH | ~1,300+ line monolith handling employee + KPI imports with complex matching logic. Recent role-update CAPA adds another mutation path. No unit tests. |
| **Dashboard.tsx** | MEDIUM-HIGH | Unified dashboard now serves 6+ view modes (self, team, skip_level, hr_pms, audit, management). Adding any new view mode or filter requires touching multiple conditional branches. |
| **AuthContext.tsx** | MEDIUM | Race condition between `onAuthStateChange` and `getSession`. Silent failures in profile/role fetch can cause auth-dependent features to malfunction. |
| **Edge Functions** | MEDIUM | Mixed import styles (`npm:` vs `https://esm.sh/`), inconsistent CORS headers, and varying auth patterns make maintenance error-prone. |

### Low Risk (Stable)

- UI component library (`src/components/ui/*`) -- standard shadcn/ui, rarely modified
- Pure utility functions with tests (`ratingCalculation`, `dailyAggregation`, `frequencyUtils`)
- Report pages -- mostly read-only views

---

## 6. DEPENDENCY NOTES

- All major dependencies are on recent versions and appear healthy.
- `xlsx ^0.18.5` is the SheetJS community edition which has known limitations (no streaming for large files). Consider monitoring for the user's import file sizes.
- `next-themes ^0.3.0` is used only for theme toggling -- lightweight and stable.

---

## Summary Priorities

1. **Immediate**: Secure `auto-rollover-kpis` and `create-backup` edge functions (add auth/secret checks)
2. **Short-term**: Delete ~2,000 lines of dead page code (SelfReview, TeamReview, ManagementReview, AuditPanel, Index)
3. **Medium-term**: Fix AuthContext race condition and add error handling for profile/role fetch
4. **Ongoing**: Add unit tests for `ImportData.tsx` parsing logic; standardize edge function patterns

