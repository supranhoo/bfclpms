
# Self Review Field Library

Add a reusable library for Self Review Fields inside the Annual Review **New / Edit Template** editor. Authors can insert single fields or whole bundles, in English + Hindi, from curated presets and from an org-saved store.

## Risk & Impact

- **Data:** New table `annual_review_self_review_library` (+ child `annual_review_self_review_bundle_items`). Additive only. No change to `annual_review_templates` schema or existing fields.
- **Workflow:** Editor-only. Picking from library still produces normal `self_review_fields[]` + `translations` entries — reviewer/self-review runtime unchanged.
- **UI/UX:** Adds an "Add from Library" button + "Insert Bundle" action next to existing "Add Field"; adds an inline EN-label combobox on each new field row. No layout shift on existing rows.
- **Regression:** Low. Insertion goes through the same `setSections` updater used today; if the library RPC fails we still allow the legacy "Add Field" flow.
- **Scalability:** Library is small (≈10s–100s of rows). Server-side `ilike` search + `limit 50`. No client-side full table dumps.
- **Mitigation:** RLS-locked writes (admin + hr_pms), unit tests on the insertion mapper, feature flag `annual_review_self_review_library_enabled` in `workflow_settings`.

## Data Model

```text
annual_review_self_review_library
  id uuid pk
  kind text check in ('field','bundle')      -- single field OR multi-field pack
  key  text unique                            -- stable slug, e.g. 'achievements'
  category text                               -- 'general' | 'blue_collar' | 'manager' | 'custom' | ...
  label_en text not null
  label_hi text
  placeholder_en text
  placeholder_hi text
  required boolean default false
  is_builtin boolean default false            -- seeded curated entries; not deletable
  is_active  boolean default true
  sort_order int default 0
  created_by uuid, created_at, updated_at

annual_review_self_review_bundle_items
  bundle_id uuid fk -> library(id) on delete cascade   -- only when parent.kind='bundle'
  field_id  uuid fk -> library(id)                     -- must reference kind='field'
  position  int
  pk (bundle_id, field_id)
```

RLS:
- `SELECT` to `authenticated` where `is_active = true` (so any editor user can read).
- `INSERT/UPDATE/DELETE` only when `has_role(uid,'admin') OR has_role(uid,'hr_pms')`; additionally `is_builtin` rows cannot be deleted (trigger guard) — only deactivated.
- GRANT block per project policy. `service_role` full access for seeding.

Seed migration: ~12 curated fields (achievements, challenges, learnings, support needed, goals next year, training needs, peer feedback, safety observations, ideas/innovation, customer feedback, attendance reflection, tool care) + 2 starter bundles (Blue-Collar 5-Q from existing preset, Manager 7-Q). Hindi populated from existing `BLUE_COLLAR_PRESET` translations where applicable.

## Service Layer (`src/services/annualReview/selfReviewLibrary.ts`)

Pure functions, unit-testable:
- `listLibrary({ search, category, kind, limit=50 })`
- `getBundleFields(bundleId)`
- `createEntry(input)` / `updateEntry(id, patch)` / `deactivateEntry(id)`
- `mapEntryToTemplateField(entry, opts)` → `{ field: SelfReviewField, translations: { hi: {...} } }`
- `mapBundleToTemplateFields(bundleId, opts)` → `{ fields, translations }`

The mapper is what plugs into existing `sections.self_review_fields` + `sections.translations['hi']` — zero changes to runtime contracts.

## UI Changes

Location: `TemplateEditorDialog.tsx` → **Self Review Fields** section (line ~509).

Toolbar (right of section title):
- `Add Field` (existing, unchanged)
- `Add from Library ▾` — opens `SelfReviewLibraryPicker` dialog
- Inside picker dropdown menu: "Insert Bundle…" tab + "Insert Fields…" tab

`SelfReviewLibraryPicker` dialog:
- Search input (debounced, server-side ilike)
- Category filter chips (driven by distinct categories returned)
- Tabs: Fields | Bundles
- List rows show EN label, HI label (muted), required pill, source badge (Built-in / Org)
- Multi-select with checkboxes; bundle row inserts all child fields atomically
- Footer: "Insert N selected"
- Admin/HR PMS only: "Manage library…" link → opens `SelfReviewLibraryManager` drawer (CRUD + activate/deactivate; built-ins can only toggle active)

Inline combobox per new field row:
- The existing `Field Label *` input becomes an autocomplete (Command + Popover) that suggests library entries matching the typed text.
- Selecting a suggestion auto-fills label, placeholder, required, and HI translations (if multilingual on).
- Free text still allowed — pressing Enter without selection keeps current behaviour.

Bilingual behaviour:
- If template `multilingual=true` and `hi` is in available_languages → mapper writes `translations.hi['field:<id>:label' / ':placeholder']`.
- If `hi` not enabled → mapper still inserts the field but skips HI translation; a toast offers "Enable Hindi to import translations".

Responsiveness: dialog `max-w-2xl`, list virtualised with simple windowing only if >200 visible.

## Permissions

- Read: any authenticated editor user (so non-admins editing a template can still insert from library).
- Write (create/update/deactivate): admin + hr_pms, enforced by RLS + UI gating via `useUserRoles`.
- Built-in rows: never hard-deleted; UI hides delete button and trigger blocks at DB level.

## Step-by-step

1. **Migration** — create both tables with GRANTs, RLS, built-in delete-guard trigger, then seed curated fields + 2 bundles.
2. **Types** — extend `src/types/annualReview.ts` with `SelfReviewLibraryEntry`, `SelfReviewLibraryBundleItem`.
3. **Service** — implement `selfReviewLibrary.ts` + `mapEntryToTemplateField` mapper.
4. **Hook** — `useSelfReviewLibrary` (react-query) with search/category/kind params and `useUpsertLibraryEntry` mutation.
5. **UI components** — `SelfReviewLibraryPicker.tsx` (dialog), `SelfReviewLibraryManager.tsx` (admin CRUD drawer), `SelfReviewLabelCombobox.tsx` (inline suggest).
6. **Editor wiring** — patch `TemplateEditorDialog.tsx` Self Review Fields section: add toolbar buttons, swap label `Input` for combobox, append fields via `setSections`.
7. **Feature flag** — read `annual_review_self_review_library_enabled` (default `true`) from `useAnnualReviewExportConfig`-style hook.
8. **Tests** — `selfReviewLibrary.test.ts` (mapper EN-only, mapper EN+HI, bundle expansion, dedup of `id` collisions), RLS smoke (admin can insert, employee cannot).
9. **Docs** — DOCUMENTATION.md v2.66.48 changelog entry; POLICY.md `§ANNUAL-REVIEW-SELF-REVIEW-LIBRARY` (scope, roles, built-in immutability, bilingual rules).
10. **Memory** — update `mem/features/annual-review/exports.md` neighbour file with a new `mem/features/annual-review/self-review-library.md` entry + index.md reference.

## Out of Scope (v1)

- Versioning / change history per library entry.
- Per-template lockdown ("only library fields allowed").
- Languages other than EN + HI.
- Bulk import from CSV.
- Sharing library across tenants/companies (multi-company partitioning) — design leaves room via optional `company_id` column added later.

## Technical Details

- **Files added:** migration, `src/services/annualReview/selfReviewLibrary.ts`, `selfReviewLibrary.test.ts`, `src/hooks/useSelfReviewLibrary.ts`, `src/components/annual-review/SelfReviewLibraryPicker.tsx`, `SelfReviewLibraryManager.tsx`, `SelfReviewLabelCombobox.tsx`.
- **Files edited:** `src/components/annual-review/TemplateEditorDialog.tsx` (Self Review Fields section only), `src/types/annualReview.ts` (+ types), `DOCUMENTATION.md`, `POLICY.md`, `mem/index.md`.
- **Rollback:** drop the two new tables + revert editor patch hunk; no destructive change to existing data.
