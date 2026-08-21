# Assign New KRA — full-page layout + collapsible legacy text

## Assumptions
- "Full page" means the Assign New KRA surface fills the whole screen (full-screen overlay) rather than becoming a new browser route. This keeps all three entry points working unchanged: Dashboard, Admin → All KPIs, and the KRA Issuance dialog.
- Presentation-only change. No field is removed, no validation, payload, RPC or scoring behaviour changes.

## Clarifications
None blocking. If you'd rather have a real route (`/admin/kpis/new`) instead of a full-screen overlay, say so and I'll adjust.

## Risk & Impact Report
- **Data impact:** none — same form state, same `useCreateKpi` payload builders (`buildTextPayload`, `buildScoringPayload`).
- **Workflow impact:** none. Created KPIs still start in the same stage.
- **UI/UX impact:** the dialog goes edge-to-edge with a sticky header and sticky footer; the body becomes a 3-column grid on large screens, 2 on medium, 1 on mobile.
- **Regression risk:** low-moderate — the file is ~1180 lines and the layout is a two-column block inside a `ScrollArea`. Mitigation: the change is limited to wrapper/grid classes and section grouping; every existing field block is moved intact, not rewritten.
- **Scalability:** unchanged (same queries: categories, profiles, templates, all KPIs).

## Step-by-step plan

### 1. Legacy free text becomes click-to-expand
`src/components/admin/kpi-form/KpiTextSplitFields.tsx`
- Wrap the "KPI Name (legacy free text)" textarea in a `Collapsible`, collapsed by default.
- Trigger row: label + chevron + a muted one-line preview of the current value (or "empty"), so the content is discoverable without opening.
- Auto-expand when the field has content and the KPI is *not* structured (so legacy rows are never hidden while being edited).
- Verification: expanding/collapsing does not alter `value.kpi_name`; the `disabled` rule when a structured title exists stays as-is.

### 2. Full-page Assign New KRA
`src/components/admin/AdminKpiCreateDialog.tsx`
- `DialogContent` → full-screen: `max-w-none w-screen h-screen sm:rounded-none p-0 flex flex-col`.
- Sticky header (title + description + close), scrollable body (`flex-1 overflow-y-auto`), sticky footer with the existing Cancel / Create actions.
- Replace the `ScrollArea` fixed `h-[72vh]` with the flex body so the form uses the full viewport height.

### 3. Structured, complete layout (nothing dropped)
Keep every existing control, regrouped into labelled cards inside a responsive grid (`grid-cols-1 lg:grid-cols-3`):
- **1. Assignment** — KRA library quick search, employee selector, review period + year.
- **2. KRA identity** — category (incl. create-new inline), KRA name, KPI name + `RegistryBadge`, structured text fields (`KpiTextSplitFields`).
- **3. Measurement** — UOM type selector, UOM, criteria, target, weightage, frequency + cycle start, day-count type, source of data.
- **4. Scoring** — the type-aware `KpiScoringEditor` branches for numeric / binary / tiered (all three kept, each still rendered under its own UOM type).
- **5. Advanced** — org-level toggle + scope, template selection, threshold mode, resubmit-reason switch, and the existing advanced settings block.
- A field-inventory pass compares the pre/post render tree so no control, tooltip or badge is lost.

### 4. Verification
- `bunx vitest run` for the existing KPI form/text suites.
- Manual pass on all three entry points: Dashboard (self + reviewer view), Admin → All KPIs, KRA Issuance confirm dialog — create one KPI end to end.

## UI changes
- Assign New KRA opens as a full-screen surface with a sticky header/footer instead of a 4xl modal.
- Content is grouped into five labelled sections across up to three columns; on mobile it stacks in the same order.
- "KPI Name (legacy free text)" is collapsed behind a click-to-expand row showing a preview of its content.

## Files touched
- `src/components/admin/kpi-form/KpiTextSplitFields.tsx`
- `src/components/admin/AdminKpiCreateDialog.tsx`
- `docs/adr/ADR-304.md` (new — presentation decision), `POLICY.md` / `DOCUMENTATION.md` version note.

## Rollback
Revert the two component files; both changes are presentation-only with no schema or RPC dependency.
