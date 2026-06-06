---
name: Org KPI Data Entry — explicit Save (ADR-075)
description: /admin/org-kpi-data uses explicit Save buttons (card + per-row), not autosave. Field edits mark dirty; Propagate is blocked until saved.
type: feature
---
- Files: `src/components/admin/OrgKpiEntryCard.tsx`, `src/components/admin/OrgKpiScopedEntryTable.tsx`, `src/hooks/useUnsavedChanges.ts`.
- Field edits (Achieved, Remark, N/A toggle, Evidence URL, scoped per-row values) MUST call `markDirty(scopeId?)`, NOT a debounced autosave. Do not reintroduce `triggerAutoSave` / `autoSaveTimerRef` / `setTimeout`-based persistence on this surface.
- Persistence is triggered ONLY by:
  - Per-row Save button in the scoped table Actions column (`onSaveRow`).
  - Card-level Save button under the org-scope inputs / N/A textarea (`handleSaveCard`).
  - The Propagate flow (still calls `onSaveAndPropagate`, which implicitly saves first).
- Propagate buttons (card-level + per-row) MUST be disabled when `cardDirty` or `dirtyScopeIds.has(scopeId)`. Tooltip: "Save unsaved changes first" / "Save row before propagating".
- `saveStatus` pill states: `idle | unsaved | saving | saved | error`. Amber "Unsaved changes" replaces the silent autosave UX.
- `useUnsavedChanges` hook MUST stay wired on the card to surface a `beforeunload` warning while any field is dirty.
- Scope: this rule applies ONLY to `/admin/org-kpi-data`. Self-review, Daily entry, Incentive grids, and Safety modules keep their own save models.