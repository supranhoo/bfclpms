## Issues observed

### 1. Why all ~1,000 employees show up
`useReviewerInstances` → `listInstancesForReviewer` runs:

```ts
db.from('annual_review_instances')
  .select('*, employee:profiles!...(...)')
  .eq('cycle_id', cycleId)
  .or('manager_id.eq.X,skip_id.eq.X,bu_head_id.eq.X,hr_id.eq.X');
```

No `.range()` / `.limit()` and no pagination. Whenever the signed-in user is mapped as **HR / BU head / skip / manager** to many employees (e.g. HR PMS, a senior manager, or a user who appears as `hr_id` for the whole org), the OR-clause matches the entire cycle — and PostgREST silently caps the response at the Data API's **1,000-row hard limit**. That is exactly what's being rendered into the left rail today, all at once, with no paging.

It is also why the "Find employee" CTA appears redundant on those accounts — the queue itself already dumps every mapped employee.

### 2. Why the multilingual option is missing on this page
`AnnualReviewI18nProvider` + `<LanguageSwitcher>` are mounted only in `EmployeeAnnualReview.tsx`. `TeamAnnualReview.tsx` renders `CriteriaScoringMatrix` directly without the provider, so `tTemplate` / `tTemplateBilingual` fall back to the no-op default and the toggle UI never renders. The template *does* carry `sections.translations` + `display_mode`, we just never read them on the reviewer side.

---

## Risk & Impact

- **Data**: read-only changes; no schema. Reviewer list switches from "fetch-all" to paged windows — fewer rows per render, identical security envelope (same RLS, same OR-clause).
- **Workflow**: queue order and selection semantics preserved. Auto-select-first becomes "auto-select first row of current page".
- **UI/UX**: left rail gets a header count, page-size selector, pager footer; review pane gets a language switcher when the template has >1 language. No new top-level navigation.
- **Regression**: directory dialog flow, assisted-mode auto-open, mobile drawer, calibration link — all untouched. Tests for `listInstancesForReviewer` extended, not rewritten.
- **Scalability**: removes the 1,000-row ceiling. Per-page cost is bounded (default 20), with `count: 'exact'` for the pager.

---

## Plan

### A. Paginate the reviewer queue (root-cause fix for issue #1)

1. **Service** (`src/services/annualReview/annualReviewService.ts`)
   - Add `listInstancesForReviewerPaginated({ reviewerId, cycleId, page, pageSize, search?, status? })`:
     - `select('*, employee:profiles!...(id, full_name, employee_code, designation)', { count: 'exact' })`
     - same `.or(...)` reviewer filter
     - optional `overall_status` eq + name/code `ilike` (resolved to `employee_id` via a slim profile lookup, mirroring `listInstancesPaginated`)
     - `.order('created_at', { ascending: false }).range(from, to)`
     - returns `{ rows, total, page, pageSize }`
   - Keep `listInstancesForReviewer` for export-only callers (or migrate them); mark deprecated in JSDoc.

2. **Hook** (`src/hooks/useAnnualReview.ts`)
   - Add `useReviewerInstancesPaginated(reviewerId, cycleId, { page, pageSize, search, status })` with `keepPreviousData: true` and a stable query key.

3. **UI** (`src/pages/annual-review/TeamAnnualReview.tsx`)
   - Replace `useReviewerInstances` usage with the paginated hook.
   - Left rail header: `My queue · {total}` + page-size selector (10 / 20 / 50, default 20, persisted in `localStorage`).
   - Move filter input from client-side `useMemo` to **server-side search** (debounced 300 ms; resets page to 1).
   - Add a status chip filter row (All / Pending self / Pending manager / …) — server-driven.
   - Footer: `shadcn/ui` `<Pagination>` showing `Page X of Y` + Prev/Next, plus "Showing N–M of T".
   - Auto-select changes to: first row of the current page; if user navigates page and `selectedId` is not in the new page, keep the detail pane mounted (we already fall back to `instances.find` — extend to a tiny in-memory cache keyed by id so detail still resolves across pages).
   - Empty / loading states updated for paged context (skeleton rows, not a single spinner).

4. **Tests**
   - Extend `src/test/annualReview/service.pagination.test.ts` with cases for `listInstancesForReviewerPaginated`: applies `.or()` once, honours `range`, returns `count`, filters by `status`, scopes name search to reviewer's set.
   - Component test: pager renders correct totals, page change triggers refetch with new range, search debounce resets to page 1.

### B. Multilingual support on the reviewer page (root-cause fix for issue #4)

1. Wrap `TeamAnnualReview`'s return tree in `<AnnualReviewI18nProvider … templateTranslations={template?.sections.translations} displayMode={template?.sections.display_mode}>`.
   - Provider needs the *selected* instance's template. Mount it inside `ReviewDetail` (which already loads `template`) — same pattern as `EmployeeAnnualReview`.
2. Inside `ReviewDetail` header (next to the status badges), render `<LanguageSwitcher>` when `availableLanguages.length > 1`, using `template.sections.default_language` + `sections.translations` to compute `availLangs`.
3. State: `const [lang, setLang] = useState(template?.sections.default_language ?? 'en')`; reset when `template?.id` changes.
4. No changes to `CriteriaScoringMatrix` — it already consumes `useAnnualReviewI18n()` for bilingual labels.
5. Test: render `ReviewDetail` with a template that has `translations` for `en` + `hi`; assert switcher is visible and toggling re-renders criterion labels via `tTemplate`.

### C. Documentation & policy sync

- `mem/features/annual-review/assisted-submission` — note the queue is now paged; the directory dialog stays the primary "find anyone" path for Admin/HR.
- `DOCUMENTATION.md` → Annual Review section: add "Reviewer queue pagination" subsection with page size + ordering rules.
- `POLICY.md` → restate the Data API 1,000-row ceiling rule and require **all reviewer-scoped lists** to use server-side pagination (no `.or()` fetch-all).

---

## Files

**Edit**
- `src/services/annualReview/annualReviewService.ts` — add paginated fetcher
- `src/hooks/useAnnualReview.ts` — add `useReviewerInstancesPaginated`
- `src/pages/annual-review/TeamAnnualReview.tsx` — paged list + i18n provider + language switcher
- `mem/features/annual-review/assisted-submission`
- `DOCUMENTATION.md`, `POLICY.md`

**Add**
- `src/test/annualReview/reviewerInstances.paginated.test.ts`
- `src/test/annualReview/teamAnnualReview.languageSwitcher.test.tsx`

---

## Open question (one)

Default page size for the reviewer queue — **20** (recommended, matches existing `listInstancesPaginated`) or **10** (tighter for senior managers with hundreds of reports, requires more pager clicks)? Confirm or pick another value and I'll wire it as the default in `localStorage`.
