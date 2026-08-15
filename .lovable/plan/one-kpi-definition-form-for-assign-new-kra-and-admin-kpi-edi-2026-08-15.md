# One KPI definition form for "Assign New KRA" and "Admin KPI Editor" (ADR-272)

Today these are two independently written forms over the same `kpis` row:

- **Assign New KRA** — `AdminKpiCreateDialog.tsx` (1,189 lines)
- **Admin KPI Editor** — `AdminKpiEditDialog.tsx` → `AdminKpiEditorForm.tsx` (1,273 lines)

They drifted. Neither reflects the two things we changed recently: the KPI text split (title / description / formula / scoring logic) and KPI type awareness (value-based, Yes-No, tiered).

## Confirmed differences today

| Capability | Assign New KRA | Admin KPI Editor |
|---|---|---|
| KRA Library search + apply | Yes | No |
| Template autofill from existing KPI / template | Yes | No |
| Create a new category inline | Yes | No |
| Cycle scope preview ("this cycle covers…") | Yes | Partial (cycle start only) |
| Source of Data | Saved, no field shown near the rest | Yes |
| Require Reason for Resubmission | No | Yes |
| Status change + mandatory reason | Not applicable | Yes |
| Apply changes to this / future / all months | No | Yes |
| Binary polarity (Yes=5 vs No=5) | Yes (toggle) | Yes (different UI) |
| Tiered option validation | Weaker | Yes |
| Threshold mode (absolute / ratio) | Yes | Yes |
| Org-level KPI + scope | Yes | Yes |
| Day count type (Daily) | Yes | Yes |
| KPI title / description / formula / scoring logic | No | No |
| Type-aware scoring scale (ADR-271) | Hardcoded R0–R5 block | Hardcoded R0–R5 block |

## Approach

Build one shared, mode-aware form and have both dialogs render it. Parity then becomes structural instead of something we re-check by hand.

### 1. Shared field layer
New `src/components/admin/kpi-form/KpiDefinitionFields.tsx` plus `kpiFormModel.ts` (state shape, defaults, `fromKpi()`, `toPayload()`, validation). Sections, in one fixed order for both dialogs:

1. Placement — Employee, Category, KRA, KPI name
2. Definition — Title, Description, Formula, Scoring logic (the split fields), Source of Data
3. Measurement — KPI type, UOM, Target, Criteria, Threshold mode, Weightage
4. Scoring scale — rendered by type (see 3 below)
5. Frequency — Frequency, Cycle start, Cycle coverage note, Day count
6. Governance — Org-level + scope, Require reason for resubmission
7. Period & status — Effective month/year (create) or Review period/year + Status (edit)

The form takes a `mode: 'create' | 'edit'` prop. Only genuinely mode-specific things stay conditional: Status + mandatory change reason, and "Apply changes to this / future / all months" (edit only); Assign button and multi-select employee (create only).

### 2. Close every gap both ways
- Editor gains: KRA Library search panel, template autofill when the KPI name matches a library/template entry, inline category creation, and the cycle coverage note.
- Assign gains: Source of Data as a first-class field, Require Reason for Resubmission, and the editor's stricter tiered validation.
- Both gain: the four split fields, with title/description prefilled from the library or template when one is picked, and an "unsplit legacy text" hint when only `kpi_name` carries everything.

### 3. Type-aware scoring (ADR-271 continuation)
Both forms replace their hardcoded R0–R5 grid with a single `KpiScoringEditor`:
- **Value based** → R5…R0 inputs + threshold mode, with the existing non-monotonic warning.
- **Yes / No** → the two options with their ratings and the polarity toggle (safety KPIs keep No = 5).
- **Tiered** → editable tier list with the existing validation.
Switching type never silently drops the other type's configuration until save; the payload builder nulls what does not apply, exactly as both forms do today.

### 4. Write path stays as-is
`useAdminUpdateKpi`, the create mutation, org-KPI placeholder creation for employee-scoped org KPIs, audit logging and the "apply to future/all months" fan-out are reused untouched. This is a form-composition change, not a scoring or workflow change.

## Risk & impact

- **Data**: no schema change. The split columns already exist (`kpi_title`, `kpi_description`, `kpi_formula`, `kpi_scoring_logic`). Writing them from these forms keeps `kpi_name` as the join key, per the forward-only split rule.
- **Workflow**: none. Status transitions, reason enforcement and month fan-out keep their current rules.
- **UI**: both dialogs get the same section order, so admins will notice a re-layout. Field-level behaviour is preserved.
- **Regression risk**: highest around payload construction and the multi-month fan-out. Mitigated by extracting `toPayload()` first and asserting it byte-for-byte matches both current payloads for the same input before either dialog is switched over.
- **Scale**: unchanged; the KRA library panel and template lists keep their existing paging/search.

## Verification

1. `kpiFormModel` unit tests: create payload and edit payload parity against the current shapes, per KPI type, including nulling rules and org-scope defaults.
2. Parity test that both dialogs render the same section set for the same KPI, and that mode-only fields appear only in their mode.
3. Manual: assign a new binary KRA, edit it, flip type to tiered, apply to future months.
4. ADR-272, DOCUMENTATION.md and POLICY.md (§KPI-DEFINITION-FORM-PARITY: the two entry points must expose one field set).

## Rollout

Phase 1 — extract model + payload builders with tests (no UI change).
Phase 2 — shared fields component; switch Admin KPI Editor.
Phase 3 — switch Assign New KRA; delete the duplicated field markup.

## Open question

Should "Apply changes to this / future / all months" also be offered on Assign New KRA (i.e. create the same KRA across the remaining cycle months in one go)? It is edit-only today, and adding it changes create semantics, so I have kept it out unless you want it.
