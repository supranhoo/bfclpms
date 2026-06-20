## Recommendation

Yes — splitting makes sense. Why:

- **Cognitive load**: the right pane today holds the full review form (system scores, eligibility, criteria matrix, evidence, send-back). That competes for attention with the 2,560-row queue. Two pages let each one breathe.
- **Deep linking & sharing**: a dedicated detail URL (`/annual-review/team/:instanceId`) is bookmarkable, shareable with HR, and survives refresh.
- **Mobile parity**: the bottom-sheet drawer becomes unnecessary — small screens just navigate.
- **Performance**: the list page no longer mounts `useTemplate` / `useInstanceResponses` / `useDebouncedResponseDraft` for the auto-selected first row, so the queue loads faster.
- **State isolation**: the directory-dialog "open assisted on land" flow becomes a simple URL param instead of cross-component state.

Trade-off: one extra click to switch reviewees. Mitigated by a "Back to queue" link plus prev/next arrows in the detail header.

---

## Risk & Impact

- **Data**: no schema, no RLS changes. Same hooks, same RPCs.
- **Workflow**: identical permissions and stage logic.
- **UI/UX**: removes the side-by-side layout; queue page becomes full-width with a denser grid (since right pane is gone). Detail page is centered, max-w ~5xl, matching `EmployeeAnnualReview`.
- **Regression risk**: medium-low. Directory dialog → "auto open assisted" must survive the navigation. Calibration link, mobile drawer, back navigation, and React Query cache all need verification.
- **Scalability**: improved — list page drops heavy form hooks.

---

## Plan

### A. Routes

- Add `/annual-review/team/:instanceId` (lazy `TeamAnnualReviewDetail`) in `src/App.tsx`, guarded the same way as `/annual-review/team`.
- Keep `/annual-review/team` as the list page (queue only).
- Sidebar entry unchanged.

### B. Split the component

Today `TeamAnnualReview.tsx` contains both `TeamAnnualReview` (list) and `ReviewDetail`. Refactor:

1. **`src/pages/annual-review/TeamAnnualReview.tsx`** — keep only the list:
   - Removes the right-section `<section className="md:col-span-2">` and the bottom `<Sheet>` drawer.
   - Removes `selected`, `seen`, `autoAssistedForInstance` cross-pane state.
   - Layout becomes a single column (or 2-col grid on xl screens with the directory CTA + filters above the list) — list items take full width, taller density, room for stage badge + last-updated + reviewer-stage chip.
   - Row click → `navigate('/annual-review/team/' + id)` (optionally `?assisted=1` when chosen via the directory's auto-assisted candidate).
   - "Find employee" directory dialog stays on the list page; `handleDirectoryPick` navigates instead of setting local state.

2. **`src/pages/annual-review/TeamAnnualReviewDetail.tsx`** (new):
   - Reads `:instanceId` from the URL, plus `?assisted=1`.
   - Loads the instance via a new lean hook `useReviewInstance(id)` (single-row `select('*, employee:profiles!...(...)').eq('id', id).single()`), with cache hydration from `annualReview` query cache when available so navigation is instant.
   - Renders the existing `ReviewDetail` body, prefixed with a sticky page header containing:
     - **Back** button → `/annual-review/team` (preserves `?page=N&search=…&status=…` so the user returns to the same queue page).
     - Employee summary (avatar, name, code, designation).
     - Language switcher + status badge.
     - Optional **Prev / Next** arrows that walk the current queue page's row IDs (passed through `location.state` from the list, falling back to undefined when navigated cold).
   - Wraps in `AnnualReviewI18nProvider` exactly like today.
   - If `instance` is `null` or unauthorised, render a friendly empty card with a back link.

3. **`ReviewDetail` body** stays largely intact — extract it into `src/components/annual-review/TeamReviewDetailContent.tsx` so both old call-sites are deleted and both pages import the same content. No logic changes; just move-and-export.

### C. List → Detail handoff

- Store the **current page's instance IDs + queue filters** in `location.state` when navigating to detail, e.g. `navigate('/annual-review/team/' + id, { state: { siblings: rows.map(r => r.id), returnTo: '/annual-review/team?...' } })`.
- Detail page uses `state.siblings` for Prev/Next; missing state → arrows hidden, only Back rendered.
- Persist queue UI state (`page`, `search`, `statusFilter`, `pageSize`) in the URL as query params on the list page so Back round-trips cleanly. (`pageSize` continues to be persisted in `localStorage` as today.)

### D. Mobile

- List page is naturally mobile-first single-column now. Tap → navigate. No drawer needed; remove `<Sheet>` from list.
- Detail page uses the same content stack vertically — same as `EmployeeAnnualReview`.

### E. Directory dialog (Admin / HR PMS)

- `handleDirectoryPick(instanceId, { autoOpenAssisted })` becomes:
  ```ts
  navigate(`/annual-review/team/${instanceId}${autoOpenAssisted ? '?assisted=1' : ''}`);
  void queryClient.invalidateQueries({ queryKey: ['annualReview'] });
  ```
- Detail page reads `?assisted=1` and forwards as the `autoOpenAssisted` prop to `TeamReviewDetailContent`.

### F. Empty state on list page

- Auto-select-first-row behaviour is removed (no right pane). The list page just shows the queue; an explicit click is required to open a review. This matches the user's mental model from the request.

### G. Tests

- `src/test/annualReview/teamAnnualReview.list.test.tsx` — row click navigates with `siblings` in state; Back URL contains current filters.
- `src/test/annualReview/teamAnnualReviewDetail.test.tsx` — loads instance by id; renders `LanguageSwitcher`; honours `?assisted=1`; Prev/Next walks `siblings`.
- Existing pagination/service tests untouched.

### H. Docs & policy

- `mem/features/annual-review/assisted-submission` — note the new detail URL contract.
- `DOCUMENTATION.md` (Annual Review section) — document the two-page split + URL params.
- `POLICY.md` — note that detail page enforces the same reviewer/proxy access via existing hooks; no new role.

---

## Files

**Add**
- `src/pages/annual-review/TeamAnnualReviewDetail.tsx`
- `src/components/annual-review/TeamReviewDetailContent.tsx` (extracted body)
- `src/hooks/useAnnualReview.ts` — new `useReviewInstance(id)` export
- `src/services/annualReview/annualReviewService.ts` — new `getInstanceById(id)`
- `src/test/annualReview/teamAnnualReview.list.test.tsx`
- `src/test/annualReview/teamAnnualReviewDetail.test.tsx`

**Edit**
- `src/App.tsx` — register the detail route
- `src/pages/annual-review/TeamAnnualReview.tsx` — strip right pane, drawer, detail; URL-sync filters; navigate on row click
- `mem/features/annual-review/assisted-submission`, `DOCUMENTATION.md`, `POLICY.md`

**Delete**
- nothing

---

## Open question (one)

When the user taps **Back** from the detail page, should the list restore the **exact previous page + filters + scroll position** (recommended — requires URL-syncing `page/search/status`), or just return to the **default queue (page 1, no filters)**? Confirm "exact restore" and I'll wire the URL params; pick the simpler one and I'll skip the URL-sync work.
