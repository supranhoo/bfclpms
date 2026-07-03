# Plan — Excel-based Template Upload on Annual Review Admin → Templates

## Goal
Add two buttons beside **+ New Template**:
1. **Download Format** — emits an .xlsx workbook that documents every field and its acceptable values.
2. **Upload Template** — accepts a filled-in workbook of that same shape and creates a full `AnnualReviewTemplate` in one shot.

The workbook itself is the contract. If the format changes, the download and the parser change together.

## Why Excel (per your instruction)
- Admins are already comfortable with the existing System Scores / Workflow / Stage Weights uploaders (`src/lib/annualReview/bulkTemplates.ts`), which are all `.xlsx`.
- The format file doubles as documentation — no separate PDF/README needed.
- A single workbook with multiple sheets handles the nested shape (criteria → options, translations, settings).

## Workbook layout (locked contract)
File name on download: `annual-review-template-format.xlsx`

| Sheet | Purpose | Columns |
|---|---|---|
| **README** | Instructions, version tag (`schema_version = 1`), do-not-rename warning, colour legend (yellow = required, blue = optional, grey = system) | Free text |
| **Template** | One row per template (usually 1) | `Name*`, `Description`, `Is Active (Y/N)`, `Display Mode` (`numeric` \| `qualitative` \| `both`) |
| **Settings** | Key/value grid | `Setting`, `Value`. Rows: `default_language`, `additional_languages` (comma-sep), `enable_audio (Y/N)`, `enable_multilingual (Y/N)`, `hide_scores_from_employee (Y/N)`, `require_evidence (Y/N)`, plus any future flags in `TemplateSettings` |
| **Criteria** | One row per performance criterion | `Criterion ID*` (author-supplied stable key), `Name*`, `Description`, `Weight (%)*`, `Category`, `Display Order` |
| **Criterion Options** | Options for each criterion | `Criterion ID*` (matches Criteria sheet), `Option Label*`, `Score (0–5)*`, `Description`, `Display Order` |
| **System Scores** | System-driven score inputs | `System Score ID*`, `Name*`, `Weight (%)*`, `Max Value`, `Description` |
| **Eligibility Criteria** | Yes/No or numeric gates | `Eligibility ID*`, `Name*`, `Type` (`boolean` \| `number` \| `text`), `Required (Y/N)`, `Description` |
| **Self Review Fields** | Free-form questions to the employee | `Field ID*`, `Label*`, `Type` (`textarea` \| `text` \| `number`), `Required (Y/N)`, `Placeholder` |
| **Stage Weights** | Blend for final score | `Stage`, `Weight (%)`. Rows for `self`, `manager`, `skip_manager`, `dept_head`, `bu_head`, `hr`, `system`, `criteria` (matches `STAGE_WEIGHT_KEYS`) |
| **Translations** | i18n strings | `Language Code*` (e.g. `hi`, `mr`), `Target Type*` (`criterion_name` \| `criterion_desc` \| `option_label` \| `self_field_label` \| `eligibility_name` \| `system_score_name`), `Target ID*` (matches ID from the relevant sheet), `Translated Text*` |

Columns marked `*` are required. Everything else is optional. All IDs are **author-supplied stable strings**; on import the parser regenerates internal UUIDs and rewires translations by the same author IDs.

## UI Changes (only place we touch)
File: `src/pages/annual-review/AnnualReviewAdmin.tsx` — `TemplatesTabImpl` toolbar (line ~1598).

```
[ 4 total templates ]     [ Download Format ] [ Upload Template ] [ + New Template ]
```

- **Download Format**: outline button, `Download` icon, calls `downloadTemplateFormatWorkbook()`. Also visible as "Download filled" on each existing template's action row so admins can export a real template and edit it.
- **Upload Template**: outline button, `Upload` icon, opens a new `TemplateUploadDialog`:
  1. File picker (`.xlsx`, `.xls` only, ≤ 512 KB)
  2. Parse preview: template name, counts (criteria / options / system scores / eligibility / self-review fields / languages), plus a validation panel showing any errors with sheet + row references
  3. Duplicate-name handling: if a template with the same name exists → radio **Import as new template** (rename) / **Import as new version** (uses existing `useCloneTemplate`) / **Cancel**
  4. Footer: **Cancel** / **Import**
- No other buttons or flows change.

## Files to add / modify
1. `src/lib/annualReview/templateWorkbook.ts` **(new)**
   - `buildTemplateFormatWorkbook(): XLSX.WorkBook` — empty format with README + headers only.
   - `buildFilledTemplateWorkbook(t: AnnualReviewTemplate): XLSX.WorkBook` — populated export of an existing template.
   - `downloadTemplateFormatWorkbook()` / `downloadFilledTemplateWorkbook(t)` — save helpers, mirroring `bulkTemplates.ts`.
   - `parseTemplateWorkbook(file: File): Promise<{ template: Omit<AnnualReviewTemplate,'id'|'created_at'|'updated_at'|'created_by'>; errors: ImportIssue[]; warnings: string[] }>` — reads the workbook, validates every sheet against a Zod schema, regenerates UUIDs, remaps translations by author IDs, and returns a ready-to-upsert payload.
2. `src/components/annual-review/TemplateUploadDialog.tsx` **(new)** — dialog described above; on confirm calls `svc.upsertTemplate` or the clone hook.
3. `src/pages/annual-review/AnnualReviewAdmin.tsx` — add the two toolbar buttons, add `Download filled` menu item per template card, mount the dialog. Reuse existing `Button` + `Upload`/`Download` icons for visual parity with the other bulk uploaders.
4. **Tests** — `src/test/annualReview/templateWorkbookIO.test.ts`
   - Round-trip: build filled workbook from a fixture template → parse → deep-equal (ignoring regenerated UUIDs).
   - Rejects: missing `Name`, criterion weight sum ≠ 100 (warn, not block), option score out of 0–5, unknown `Target Type`, translation `Target ID` not found in the referenced sheet, wrong `schema_version`, > 512 KB, wrong sheet names.
   - Duplicate-name path calls the clone service, not `upsertTemplate`.

## Data / DB Impact
- **None.** Uses the existing `svc.upsertTemplate` and `useCloneTemplate` paths. No schema change, no migration, no RLS change.
- Import is admin-only (same gating as the current Templates tab).

## Response-contract sections
- **Assumptions**
  - One template per workbook.
  - Author-supplied IDs are strings unique within their sheet (parser fails otherwise).
  - Assignment rules / cycle-scoped mappings are out of scope — they stay in the existing bulk assignment dialog.
- **Risk & Impact**: UI-only addition; no existing behaviour changes. Rollback = delete the two new files and revert the toolbar hunk.
- **Scalability**: Parse happens in-browser; size-capped ≤ 512 KB; single insert on submit.
- **Security**: Zod validation before hitting the service; author IDs are discarded after remap so cross-tenant collisions are impossible; file size and MIME checked.
- **Documentation**: append a "Template Excel Import/Export" section to `DOCUMENTATION.md` and record the workbook schema version in `POLICY.md`.

## Out of scope (explicit)
- JSON import path (Excel is the only supported format per your instruction).
- Bulk multi-template upload.
- Copying cycle assignments / assignment rules with the template.

Approve to build, or tell me what to trim/expand — for example, if any field in `TemplateSettings` should be omitted from or promoted on the **Settings** sheet.
