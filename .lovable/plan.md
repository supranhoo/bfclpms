

## Redesign: Program-Centric Incentive Config Layout

### Problem
The current tab-based layout separates Programs, Mapping, Slabs, and DQ Rules into isolated tabs. Users must select a program in one tab, then switch to another tab to see its details. This is confusing — there's no contextual view of what a program contains.

### Solution
Replace the disconnected tab layout with a **master-detail** pattern:

**Left side / Top**: Program list (cards, not a table) with summary badges showing mapping count, slab count, and DQ rule count at a glance.

**When a program is clicked**: Expand inline to show an accordion/sub-tabs view with all 3 sections (Mapping, Slabs, DQ Rules) for THAT program — all visible in context.

**Eligibility Data** remains a separate top-level tab since it's cross-program.

### New Layout

```text
[Programs]  [Eligibility Data]     ← only 2 top tabs

Programs tab:
┌─────────────────────────────────────────────┐
│ + New Program                               │
├─────────────────────────────────────────────┤
│ ┌─ CLU Incentive ─── production ── Active ┐ │
│ │ 3 depts · 12 slabs · 4 DQ rules        │ │
│ │ ▼ Expand                                │ │
│ │  [Mapping] [Slabs] [DQ Rules]  ← inner  │ │
│ │  ... content for THIS program ...       │ │
│ └─────────────────────────────────────────┘ │
│ ┌─ Support Function ── support ── Active ─┐ │
│ │ 2 grades · 8 slabs · 3 DQ rules        │ │
│ │ ► Collapsed                             │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Changes

#### `src/pages/admin/IncentiveConfig.tsx` — Full rewrite

- Top-level: 2 tabs only — "Programs" and "Eligibility Data"
- Programs tab renders a list of **expandable program cards** (using Collapsible or Accordion)
- Each card header shows: Name, Type badge, Status badge, Effective Period, Edit/Delete buttons, and summary counts (mapped employees, slabs, DQ rules)
- Expanding a card reveals **inner sub-tabs**: Mapping | Slabs | DQ Rules — rendering the existing components (`ProgramEmployeeMapping`, `IncentiveSlabEditor`, `DisqualificationRulesEditor`) scoped to that program
- Only one program expanded at a time (accordion behavior)
- Remove the old `selectedProgramId` + disabled-tab pattern entirely

#### Summary count hooks (lightweight)

Add 3 small count queries to show in each card header:
- Mapping count: `useProgramMappings(programId)` already exists — use `.length`
- Slab count: quick `select('id', { count: 'exact', head: true })` from `incentive_slabs` filtered by `program_id`
- DQ rule count: quick `select('id', { count: 'exact', head: true })` from `incentive_dq_rules` filtered by `program_id`

These can be added as `useSlabCount(programId)` and `useDqRuleCount(programId)` in `useIncentivePrograms.ts`, or fetched inline.

### Files Modified
- `src/pages/admin/IncentiveConfig.tsx` — rewrite layout to accordion-based program cards with inline sub-tabs
- `src/hooks/useIncentivePrograms.ts` — add `useSlabCount` and `useDqRuleCount` hooks

### No database changes needed

