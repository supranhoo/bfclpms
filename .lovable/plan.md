## 1. Assumptions
- The existing `BulkReviewMatrixGrid` already implements a sticky first column + sticky header, but you want the behavior **verified and polished** so it works reliably at 1309×853 (your current viewport) with no layout breaks, no shifting, and clean scrollbar styling.
- "Performance optimized for large datasets" means the matrix must stay smooth at hundreds of employees × dozens of KPIs — without changing scoring logic, RPCs, or workflow.
- No backend / RLS / policy changes are involved.

## 2. Clarifications
Not Applicable — requirements are visual/interaction polish on an existing matrix.

## 3. Risk & Impact Report
- **Data Impact:** None. No schema, RLS, or scoring changes.
- **Workflow Impact:** None. Reviewer permissions and selection logic unchanged.
- **UI/UX Impact:** Sticky-column rendering becomes more robust (solid backgrounds, shadow separator, zebra rows, custom scrollbar). Header row stays sticky during vertical scroll.
- **Regression Risk:** Low–Medium. Sticky `td` styling can break if hover/zebra backgrounds are transparent — addressed in mitigation.
- **Scalability Impact:** Current implementation renders all rows. Beyond ~3k cells the DOM gets heavy. We'll keep the existing 25k-cell scope cap and add lightweight row virtualization **only if needed** behind a threshold (e.g. > 1500 cells); otherwise plain DOM stays for simplicity.
- **Mitigation Plan:** Use opaque background tokens on the sticky column (no transparency), keep `border-collapse: separate` (already set), preserve `min-width` + fixed width on all cells, add `scroll-behavior: smooth` and themed scrollbar, and add a focused unit/source test asserting the sticky classes remain.

## 4. Step-by-step Plan
1. **Audit current sticky behavior in `BulkReviewMatrixGrid.tsx`**
   - Confirm `position: sticky` works on the KPI `<td>` and header `<th>` inside the `overflow-auto` container at 1309×853.
   - Ensure top-left corner cell has the highest `z-index` (already `z-50`).

2. **Strengthen the frozen column visuals**
   - Force opaque `bg-card` / `bg-muted` on sticky cells (avoid translucent hover that lets columns show through during horizontal scroll).
   - Keep the right-edge shadow (`shadow-[4px_0_8px_-4px_...]`) so the frozen column is visually separated from scrolling content.
   - Apply hover state via an inner wrapper, not via translucent `bg-muted/40` on the sticky `<td>`.

3. **Add alternating row background for readability**
   - Apply a subtle zebra stripe using a CSS variable–based background (e.g. `bg-card` vs `bg-muted/30`) consistently on both the sticky KPI cell and each employee cell so striping aligns across the frozen + scrollable sections.

4. **Polish horizontal/vertical scrolling**
   - Add `scroll-behavior: smooth` to the scroll container.
   - Add a small themed scrollbar (Tailwind utility classes + `index.css` `::-webkit-scrollbar` rules using existing tokens — no new color values).
   - Keep `max-h-[calc(100vh-180px)]` so vertical scroll happens inside the matrix, not the page.

5. **Maintain alignment**
   - Keep fixed `KPI_COL_W` (260px) and `EMP_COL_W` (112px) with both `minWidth` and `width` already applied — confirm `box-sizing: border-box` (default in Tailwind) so borders don't push cells.
   - Ensure KRA category band row uses `colSpan = employees.length + 1` (already correct) so striping/alignment isn't broken.

6. **Performance guardrails (no behavior change for small scopes)**
   - Keep accumulated dataset cap at 25k cells (already enforced upstream).
   - Add `content-visibility: auto` + `contain-intrinsic-size` on KPI rows so off-screen rows skip paint cost for very large matrices. This is a CSS-only optimization, no virtualization library.
   - If we later need true virtualization, we already have `BulkReviewVirtualGrid` as a fallback; not introduced in this change.

7. **Responsive verification at current viewport (1309×853)**
   - Verify the toolbar above the matrix doesn't push the matrix below the fold.
   - Confirm horizontal scrollbar appears as soon as employee columns overflow.
   - Confirm KPI column stays pinned while scrolling right; header row stays pinned while scrolling down.

8. **Tests**
   - Source-level test asserting `BulkReviewMatrixGrid.tsx` still contains the sticky class names on KPI `<td>` and employee `<th>` (guards against accidental removal).
   - Render test: with N=30 employees and 20 KPIs, the table has exactly `1 + N` columns in the header and the sticky cell carries `sticky left-0`.

9. **Documentation & memory**
   - `DOCUMENTATION.md` → add v2.66.12.7 entry: "Bulk Review matrix — frozen KPI/KRA column hardened, themed scrollbar, zebra rows, `content-visibility` for large matrices."
   - `mem/features/review/bulk-review-dashboard` → note the new visual hardening and zebra/scrollbar tokens.

## 5. UI Changes
- **Location:** `/review/bulk-scoring`, the matrix grid surface.
- **Visual changes:**
  - First column (`KPI / KRA`) stays visually pinned to the left during horizontal scroll with a soft right-edge shadow.
  - Header row (employee chips) stays pinned to the top during vertical scroll.
  - Rows have a subtle alternating background that lines up across the frozen and scrollable sections.
  - Horizontal scrollbar uses theme tokens; scroll animates smoothly.
- **Interaction:** No change to clicking cells, selecting submissions, KRA collapse/expand, or display mode toggle.
- **Responsiveness:** At 1309×853, the user sees the frozen KPI column + as many employee columns as fit, with smooth scrolling for the rest. No browser zoom-out required.

## 6. Implementation
Frontend-only edits, scoped to:
- `src/components/review/BulkReviewMatrixGrid.tsx` — sticky cell backgrounds, zebra stripe, smooth scroll, `content-visibility`.
- `src/index.css` — small themed scrollbar rules using existing CSS variables (no new color tokens).
- `DOCUMENTATION.md` — version history entry.
- `mem/features/review/bulk-review-dashboard` — behavior note update.

No changes to: hooks, RPCs, RLS, scoring logic, workflow engine, edge functions, or migrations.

## 7. Tests
- Add a focused source test (or extend an existing one) asserting the sticky class names remain on the KPI `<td>` and header row.
- Manual QA checklist:
  - Scroll right → KPI column stays visible, header chips scroll with their column.
  - Scroll down → header row stays visible, KPI column scrolls vertically with rows.
  - Resize between 1280, 1366, 1440 widths → no layout break, no horizontal page scroll, only internal matrix scroll.
  - Toggle "Show KRA · Wt%" → row heights stay aligned across frozen + scrollable sections.

## 8. DOCUMENTATION.md updates
Add Version History entry **v2.66.12.7** describing:
- Frozen KPI/KRA column hardened with opaque background + edge shadow.
- Sticky header row preserved.
- Themed scrollbar + smooth horizontal scroll.
- `content-visibility: auto` for large matrices.
- No RPC / RLS / scoring changes.

## 9. POLICY.md updates
Not Applicable — visual/interaction polish only; no business rule, scoring, workflow, or governance change.

## 10. Post-implementation notes
- Rollback: revert the two frontend files and the doc/memory edits.
- Backup coverage unaffected (no DB tables added).
- Used the `ui-ux-pro-max` skill for sticky-column, scroll behavior, zebra striping, scrollbar theming, and large-dataset performance decisions.