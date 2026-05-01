# Phase 3 — Operationalize the Canonical Registry

Phase 2 built the registry, an auto-link trigger, and an admin Health dashboard. The registry is now silently working in the database, but **end users (managers, employees, auditors) and reporting layers don't see or benefit from it yet**. Phase 3 closes that gap.

Three sub-phases, sequenced from highest user value to deepest plumbing.

---

## Sub-Phase 3a — Registry Picker in Creation Flows

**Goal:** When anyone creates or edits a KPI for May 2026+, they get a searchable suggestion of canonical names. Custom text is still allowed (soft enforcement holds), but the default path becomes "pick from registry."

### What changes

- New shared component `<RegistryPicker>` — combobox with type-ahead search over `kpi_definitions` filtered by `category_id`. Shows canonical KRA + KPI together with a small "registered" badge.
- Wired into the four KPI-authoring surfaces:
  1. **Smart KRA Assignment** (`SmartKraAssignment.tsx`) — picker appears next to the manual KRA/KPI inputs.
  2. **Bulk Import** (`KpiBulkImport.tsx`) — preview row gets a "matched canonical" indicator; unmatched rows get a one-click "Promote" link to the registry tab.
  3. **Org KPI creation** (`OrgKpiCreate.tsx`) — same picker.
  4. **Admin Data Entry → "Add KPI"** — same picker.
- "Not in registry" badge appears inline when the user types a name that has no alias match. No blocking, no warning — just a quiet hint.

### What stays the same

- Free-text input remains fully functional (soft enforcement per §88C).
- Pre-May-2026 flows (data repair, retrospective imports) bypass the picker entirely to avoid touching frozen periods.
- The DB trigger continues as the single source of truth — the picker only **assists**; it does not replace the trigger.

### Risk & Impact

- **Data Impact:** None. Picker writes the same `(kra_name, kpi_name, kpi_definition_id)` columns the trigger already maintains.
- **Workflow Impact:** Authors gain a faster path. Free-text behavior unchanged.
- **UI/UX:** One new combobox in 4 places, reused component. Tooltip: "Pick a standard KPI or type a custom one."
- **Regression Risk:** Bulk Import is the highest-risk surface. Mitigation: existing import path stays unchanged when no match exists; new tests in `importValidation.test.ts` cover alias auto-match and the "no registry available" fallback.

---

## Sub-Phase 3b — Canonical Names in Reports & Trends

**Goal:** Reports that aggregate across months should show **one canonical row** instead of three near-duplicate variants. Per-month grids stay untouched (per §88B).

### Targets (cross-period aggregations only)

- **PerformanceTrend** charts on Profile and Dashboard — group time-series points by `kpi_definition_id` so a renamed KPI shows as one continuous line.
- **KPI Journey Report** (`useKpiJourneyReport.ts`) — when "All periods" is selected, collapse variants under their canonical name with an "Also known as" tooltip listing the variant texts that were merged.
- **Variance Report** (`VarianceReport.tsx`) — same merge rule for cross-period comparisons.
- **Employee Performance Summary** (`EmployeePerformanceSummary.tsx`) — KRA/KPI rollup uses canonical names when aggregating across the fiscal year.

### What stays the same

- **Single-period reports** (Monthly Scorecard, KPI Mapping Matrix, KpiEmployeeMatrix) are NOT modified — they show the original row text per §88B.
- Excel/CSV exports continue to export the original `kra_name`/`kpi_name` columns, with a new optional column `canonical_name` so analysts can pivot either way.

### Reuse from Phase 2a

- `useCanonicalResolver()` and `groupByCanonicalKey()` already exist — no new resolver logic. Phase 3b is integration work.

### Risk & Impact

- **Data Impact:** Read-only. No DB changes.
- **Workflow Impact:** Trend lines become more accurate; some reports collapse rows that previously appeared duplicated.
- **UI/UX:** `GitMerge` icon + "Also known as" tooltip pattern (already in KraSummaryTab) reused for consistency.
- **Regression Risk:** Medium — reports are visible to managers and management role. Mitigation: snapshot tests for each report's row count before/after merging using the existing canonicalGrouping test fixtures.

---

## Sub-Phase 3c — Registry Visibility for Non-Admins

**Goal:** Managers and HR PMS roles get read-only visibility into "what counts as KPI X" without needing admin access. Removes the "shadow taxonomy" problem where only admins know the canonical list.

### Additions

- **New page `/registry**` — read-only canonical taxonomy browser:
  - Search + filter by category.
  - Each definition shows: canonical name, all aliases, count of linked KPIs in current fiscal year, `GitMerge` indicator if it has aliases.
  - Visible to: Admin, Manager, HR PMS, Management, Auditor, Skip-Level (everyone except plain Employee, who has no taxonomy-management need).
- **New RPC `get_public_registry_view()**` — SECURITY DEFINER, returns the same shape as the admin coverage stats but with no occurrence counts (privacy: a manager shouldn't see how many other employees share a KPI).
- **Sidebar entry** under "References" — single menu item gated by `useMenuAccess('registry')`.
- **Cross-link** from KPI rows in review pages: clicking a KPI's name (when it has a `kpi_definition_id`) opens a side-sheet with the canonical entry and its aliases. No navigation, no data mutation.

### Risk & Impact

- **Data Impact:** Read-only. New RPC respects role check but exposes only registry metadata, never KPI values or employee identities.
- **Workflow Impact:** New menu entry. Non-admins gain reference visibility.
- **UI/UX:** New page follows the existing reports shell. Side-sheet pattern reused from existing KPI detail panels.
- **Regression Risk:** Low. New surface, doesn't modify existing pages except to add an optional click target on KPI names.

---

## Sequencing & Delivery

```text
Sub-Phase 3a (Pickers)        ✅ shipped 2026-05-01 (§88E)
        ↓
Sub-Phase 3b (Reports)        ✅ shipped 2026-05-01 (§88F) — trimmed to KpiJourneySection prev-month panel only
        ↓
Sub-Phase 3c (Visibility)     ✅ shipped 2026-05-01 (§88G) — `/registry` page + `get_public_registry_view` RPC
```

**Phase 3b scope correction (post-audit):** A walkthrough of the codebase
found that the originally-named report targets (VarianceReport,
KpiJourneyReport, ManagementDashboard trend, EmployeePerformanceSummary)
were either single-period (forbidden by §88B) or org-aggregate (no
per-KPI grouping happens). The only surface where renames cause real
data loss is `KpiJourneySection`'s "Previous 2 Months" panel; Phase 3b
is therefore narrow by design. Documented in §88F.

Each sub-phase ends with:

- Unit tests for new hooks and the picker
- Updated mock data with mixed registry-linked + custom rows
- DOCUMENTATION.md and POLICY.md (§88E) updates
- mem://features/admin/kpi-standardization-registry refresh

---

## Out of Scope (deferred to a possible Phase 4)

- Hard enforcement (blocking custom names) — still soft per user decision in Phase 2.
- Auto-merging of definitions — admin-driven only.
- ML-based fuzzy suggestions beyond the existing `nk()` normalization.
- Retroactive rewrite of pre-May-2026 KPI names — frozen by Phase 1.
- Notification when a manager's report row gets auto-merged (would require notification engine changes; not justified yet).

---

## Open Question

Phase 3 is sized for sequenced delivery. Two reasonable variations:

1. **Ship 3a only first**, validate adoption (do authors actually use the picker?), then decide whether 3b and 3c are worth building.
2. **Ship all three sequentially** as planned above — same model as Phase 2.

Which would you prefer? same model as Phase 2.