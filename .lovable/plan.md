## Goal
Restructure the Bulk Review (`/review/bulk-scoring`) top bar so **all** controls fit in **2 rows**, always visible — no Filters popover.

## Final Layout

**Row 1 — Identity · Search · Stage · Primary CTA**
```
[≣ Bulk Review Beta] [139 emp · 2139 KPI · ~167KB] [🔍 Search KPI/Employee ─────] [👤 Stage ▾] [⚡ Load Scope]
```

**Row 2 — Filters (inline, icon + placeholder only) · View mode**
```
[📅 May ▾][2026 ▾][🏢 All Companies ▾][🗂 All Divisions ▾][🏭 All BUs ▾][👥 All Depts ▾][🏷 All Categories ▾]   [Wt% | Score | Both][👁]
```

### Visual rules
- Sticky header: `sticky top-0 z-20 bg-background/95 backdrop-blur border-b`
- Each row: `flex flex-wrap items-center gap-2 px-4 py-2`
- Selects uniform: `h-8 text-xs min-w-[110px] max-w-[160px]`; leading Lucide icon (`Calendar`, `Building2`, `Layers`, `Factory`, `Users`, `Tag`) + placeholder text (no separate Label)
- Search input: `flex-1 min-w-[220px] max-w-[380px]`, `h-8`
- View-mode segmented (`Wt%/Score/Both`) + eye toggle grouped in a single bordered pill, right-aligned on Row 2
- Meta strip (`139 emp · 2139 KPI · ~167KB`) becomes a compact inline chip beside the title on Row 1
- Stage selector + Load Scope CTA pinned right on Row 1
- Remove existing `Filters` Popover + trigger entirely
- Responsive: `flex-wrap` lets Row 2 wrap into 3 rows below `md`; desktop ≥1280 stays at 2 rows

### Files to touch
- The bulk-review toolbar (likely `src/components/review/BulkReviewToolbar.tsx` or inlined in `src/pages/review/BulkScoring.tsx`) — JSX/Tailwind restructure only
- Remove now-unused `Popover` imports
- No changes to state hooks, handlers, RPC, or `useBulkScopePreview`/`useBulkReviewSnapshot`

### Tests
- Add component test confirming all 7 filter selects + search + stage + view-mode + Load Scope render inline (no popover trigger present)
- Verify a11y: each icon-only select has `aria-label` (Month, Year, Company, Division, Business Unit, Department, Category)

### Docs
- `DOCUMENTATION.md` v2.66.x entry: "Bulk Review toolbar flattened to a 2-row inline layout; Filters popover removed; icon + placeholder selects."
- `POLICY.md`: no change (pure presentation; ADR-064 lean-load still intact — Load Scope still gates the snapshot RPC)

### Risk & Impact
- **Data / Workflow / Security**: none
- **UI**: denser bar; mobile wraps to 3 rows — acceptable
- **Regression**: low; single-file JSX refactor
- **Rollback**: revert the toolbar file

### Verification
- Manual @1431px: 2 rows, no horizontal scroll, no popover trigger
- @768px: wraps cleanly, all controls reachable
- Load Scope still triggers snapshot fetch (no behavior drift)

Used the **ui-ux-pro-max** and **bfcl-ui-standards** skills.
