## Goal
When an admin edits a KPI from the Admin Edit dialog without changing status, the Review Timeline currently labels the event "Admin Override" and adds a misleading "New Status: Self Review" line. Reclassify it to **KPI Updated** (descriptive fields) or **Logic Updated** (scoring thresholds), and hide the noisy "New Status" line when status didn't actually change.

## Assumptions
- Audit row already carries the right metadata: `source: 'admin_edit_dialog'`, `status_changed: boolean`, and `changed_fields: string[]` (verified via `useKpis.ts:741-755` and the live audit row for KPI 101962 / May 2026).
- "Admin Override" label must remain for genuine non-edit-dialog overrides (e.g. bulk override, direct status overrides whose source ≠ `admin_edit_dialog`).
- No backend / DB change needed. Pure UI relabel + detail-line filtering.

## Logic Classification (SSOT helper)
New file `src/lib/auditLabels.ts` exporting:
- `LOGIC_FIELDS = ['r0','r1','r2','r3','r4','r5','threshold_mode','criteria','uom_type','qualitative_options']`
- `classifyAdminOverride(log)` returns one of:
  - `'logic_updated'` — `source==='admin_edit_dialog'`, `status_changed===false`, and every entry in `changed_fields` is in `LOGIC_FIELDS`.
  - `'kpi_updated'` — `source==='admin_edit_dialog'`, `status_changed===false`, otherwise.
  - `'admin_override'` — anything else (status actually changed, or non-edit-dialog source).
- Label map: `kpi_updated → 'KPI Updated'`, `logic_updated → 'Logic Updated'`, `admin_override → 'Admin Override'`.

## UI Changes

### 1. `src/components/dashboard/KpiTimeline.tsx`
- `getActionConfig(log)` (signature change from `(action)` → `(log)`): for `action === 'ADMIN_OVERRIDE'`, call `classifyAdminOverride` and swap label + icon:
  - `kpi_updated` → icon `Edit`, color `bg-slate-500`, label `KPI Updated`
  - `logic_updated` → icon `Sliders` (lucide), color `bg-amber-500`, label `Logic Updated`
  - default → keep existing rose `Admin Override`
- In `formatDetails`, drop the `New Status: …` push when `log.action === 'ADMIN_OVERRIDE' && log.metadata?.status_changed === false`. Add a single concise line: `Updated fields: <human list>` (map raw field names via a small label dictionary — `r0..r5`/`threshold_mode`/`criteria`/`uom_type`/`qualitative_options` → "Scoring Logic"; `kpi_name`→"KPI Name"; `kra_name`→"KRA Name"; `weightage`→"Weightage"; `frequency`→"Frequency"; `target_value`→"Target"; `uom`→"UOM"; `source_of_data`→"Source of Data"; others → Title Case). De-duplicate so a logic-only edit shows just "Updated: Scoring Logic".

### 2. `src/components/review/KpiJourneySection.tsx` (the modal in the screenshot)
- Same two changes:
  - Action-label resolution: replace the static `actionLabelMap[log.action]` call with a helper that re-classifies `ADMIN_OVERRIDE` via `classifyAdminOverride`. Applied both in the on-screen list and in the `auditLogs.map(...)` passed to `exportReviewTimelinePdf`, so the PDF stays in sync.
  - `formatAuditDetails`: skip the `New Status:` push when `status_changed === false`; emit the same "Updated fields: …" summary.

### 3. `src/lib/pdfExport.ts`
- No structural change; the call site (above) feeds it the corrected label + details, so PDF mirrors the UI automatically. Verify that `Review Timeline` PDF section reads from the `label`/`details` props (it does).

### 4. `src/pages/reports/AuditTrailReport.tsx`
- Replace the static `'admin_override': 'Admin Override'` mapping with the same `classifyAdminOverride` call so the Audit Trail report shows "KPI Updated" / "Logic Updated" too. Existing CSV export reads the same label.

### 5. Test coverage
- Add `src/lib/auditLabels.test.ts` covering: logic-only fields → `logic_updated`; mixed fields → `kpi_updated`; status_changed=true → `admin_override`; source=`bulk_override` → `admin_override`.

## What does NOT change
- Audit row writer in `useKpis.ts` (already records the metadata we need).
- `ADMIN_STATUS_OVERRIDE` action (real status change) stays labelled "Admin Status Override".
- Reset / step-back / data-entry actions are untouched.

## Visual Result (Review Timeline modal)
Before:
```
🌐 Admin Override
   by Jaspal
   • New Status: Self Review
```
After (this case — only `kpi_name` & `kra_name` changed):
```
✏️ KPI Updated
   by Jaspal
   • Updated fields: KPI Name
```
If only `r0…r5`/`threshold_mode` changed:
```
🎚️ Logic Updated
   by Jaspal
   • Updated fields: Scoring Logic
```

## Risk & Rollback
- Risk: low — purely presentational; no schema / RPC / data mutation.
- Old audit rows render correctly because `classifyAdminOverride` falls back to `admin_override` when metadata is missing (`source` undefined).
- Rollback: revert the three component files + helper.

## Docs
- Append a one-line entry to DOCUMENTATION.md "Review Timeline labels" section and POLICY.md under §audit-display noting: "Admin Override is split into KPI Updated / Logic Updated when source = admin_edit_dialog and status_changed = false."
