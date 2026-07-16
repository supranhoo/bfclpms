## Problem

On **Team Annual Review**, the HR Head appears in every row because he is simultaneously:

- **Manager** for his own direct reports,
- **Dept Head / BU Head** for his department + BU, and
- **HR** for the entire company.

The current queue merges all five reviewer roles with a single `.or(manager_id.eq…,skip_id.eq…,dept_head_id.eq…,bu_head_id.eq…,hr_id.eq…)` in `listInstancesForReviewerPaginated` (annualReviewService.ts:669), and every card renders the same "BU Head Review Pending" chip. He has no way to answer *"who reports to me directly?"* without opening each card.

The same friction hits any user who holds >1 reviewer role (BU Heads who also manage a team, Dept Heads who are also skip-level, etc.). The fix must be generic, not HR-only.

## Solution — add a "My role" scope filter + per-row role badge

Two coordinated, minimal changes on the existing screen. No schema/RLS changes.

### 1. New "My role" filter (chip group)

A second row of chips above the existing status chips, showing only the roles the current user actually holds in the current cycle:

```text
My role:  [ Any ]  [ Direct reports ]  [ Skip-level ]  [ Dept Head ]  [ BU Head ]  [ HR ]
Status :  [ All ]  [ Self ] [ Manager ] [ Skip ] [ Dept Head ] [ BU ] [ HR ] [ Done ]
```

- Default = **Any** (current behavior — no regression).
- Selecting **Direct reports** filters the queue to instances where `manager_id = me` (i.e. the employee's `profiles.reporting_manager_id` at snapshot time).
- Skip / Dept / BU / HR do the same against `skip_id` / `dept_head_id` / `bu_head_id` / `hr_id`.
- Chips are hidden when the user is not that role for anyone (e.g. a pure manager only sees `Any` + `Direct reports`).
- Selection is URL-synced (`?scope=direct`) so Back-from-detail restores it, matching how `q` / `status` / `page` already work.

**Independent from the Status filter** — the two combine (e.g. `scope=direct` + `status=pending_manager` = "my direct reports still awaiting me").

### 2. Per-row "your role" badge

Every card gets one extra tiny badge next to the existing status badge, showing *which hat* the current user is wearing for that row:

```text
[BU Head Review Pending]  You: Manager    Assisted
[BU Head Review Pending]  You: BU Head    Assisted
[BU Head Review Pending]  You: HR
```

Priority order when the user matches multiple fields on one row (e.g. HR head of his own direct report): **Manager → Skip → Dept Head → BU Head → HR**. This mirrors the natural "closest relationship first" mental model and matches the reviewer-chain order already used elsewhere in the codebase.

The badge is computed client-side from fields already returned by the query (`manager_id`, `skip_id`, `dept_head_id`, `bu_head_id`, `hr_id` vs `user.id`) — no extra fetch.

## Technical Details

**Files touched (3):**

1. **`src/services/annualReview/annualReviewService.ts`**
   - Extend `ListReviewerInstancesPaginatedArgs` with `scope?: 'any' | 'manager' | 'skip' | 'dept' | 'bu' | 'hr'`.
   - When `scope` is set and ≠ `'any'`, replace the 5-way `.or(...)` with a single `.eq('<role>_id', reviewerId)`. Falls back to the current `.or(...)` when `scope='any'` or omitted → zero behavior change for existing callers.
   - Add a tiny helper `getReviewerRoleCounts(reviewerId, cycleId)` returning `{manager, skip, dept, bu, hr}` counts so the UI can hide chips the user doesn't qualify for. One RPC-free query using PostgREST `head: true, count: 'exact'` per role, cached 5 min.

2. **`src/hooks/useAnnualReview.ts`**
   - Add `scope` to `useReviewerInstancesPaginated` opts (passes straight through).
   - Add `useReviewerRoleCounts(reviewerId, cycleId)`.

3. **`src/pages/annual-review/TeamAnnualReview.tsx`**
   - Add `scope` URL param + state (default `'any'`), reset page on change, mirror into `returnTo`.
   - Render the "My role" chip row using role counts (chip hidden if `count === 0`; the "Any" chip is always shown).
   - Add a small `RelationshipBadge` next to `AnnualReviewStatusBadge` inside each card, computed once per row via the priority order above.

**No DB / RLS changes.** All 5 reviewer id columns are already selected by the query and already RLS-visible to the user (row wouldn't be in the queue otherwise).

## Verification

1. Log in as the HR head account, open `/annual-review/team` → confirm 5 chips visible (Any + all 4 roles he holds).
2. Click **Direct reports** → confirm queue narrows to only employees whose `reporting_manager_id` is him, and card badges read `You: Manager`.
3. Combine with `Status = Self` → confirm only his direct reports still at `pending_self` show.
4. Log in as a pure Manager → only `Any` + `Direct reports` chips render (others hidden by zero counts).
5. Browser Back from detail restores `scope`, `q`, `status`, `page` together.
6. Existing users who never touch the new filter see identical results (default `scope='any'` skips the new WHERE branch).

## Risk & Impact

- **Data:** none — read-only additive filter over columns already selected.
- **Workflow:** none — no permissions change, no writes.
- **UI:** one new chip row + one small badge per card. Preserves current layout; wraps on mobile.
- **Regression:** low. Default path is unchanged; new WHERE branch only fires when `scope ≠ 'any'`.
- **Perf:** the single-column `.eq()` variant is strictly cheaper than the 5-way `.or()`. Role-counts query is 5 tiny `head:true, count:'exact'` calls, cached 5 min per user+cycle.

## Out of Scope (call out, don't build)

- Filtering by *functional manager* relationship — not currently a reviewer column on the instance.
- Persisting per-user default scope (e.g. "always start on Direct reports") — trivial follow-up via localStorage if desired after we see usage.
- Applying the same scope filter to the Calibration worksheet — separate screen with its own query; flag for a later pass if the user wants parity.
