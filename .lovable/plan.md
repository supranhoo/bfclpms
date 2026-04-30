
# IAC Bulk Tab — Full Download/Upload + Hardened Error Handling

## Risk & Impact Report
- **Data Impact**: Read-only export + idempotent inserts to `iac_user_role_assignments`. No schema change. Existing `previewBulk`/`applyBulk` already de-dup server-side.
- **Workflow Impact**: None. Same grant semantics as the People drawer; just batched.
- **UI/UX**: Bulk tab gains 2 actions (Download, Upload File) + a structured preview table. Other tabs untouched.
- **Regression Risk**: Low. Service layer is additive — current paste-CSV path keeps working.
- **Mitigation**: Unit tests for CSV parse/serialize and preview categorization; toast surfaces every failure (no silent catch).

## What changes (user-visible)

### Bulk tab — three clear sections

1. **Download current data** — two buttons:
   - **Download Assignments CSV** — every row in `iac_user_role_assignments` joined with `profiles.email` and `iac_roles.code`, columns: `email,role_code,scope_type,scope_id,expires_at,assigned_at`. Same shape that Upload accepts → round-trip safe.
   - **Download Template CSV** — empty file with header row + 1 example line + a `# comments` header explaining valid `scope_type` values and date format.

2. **Upload data** — two input modes:
   - **Choose file** button accepting `.csv` (uses `FileReader`).
   - Existing **Paste CSV** textarea (kept for power users).
   - Live **Preview** runs automatically on parse and shows 4 buckets in a table: ✅ Ready (N), ❌ Unknown email (N), ❌ Unknown role code (N), ⚠️ Already exists (N) — each expandable to see the offending rows.
   - **Apply** button is disabled until parse succeeds and at least 1 row is in the Ready bucket. Button label shows the exact count: "Apply 12 assignments".
   - After Apply: success toast with inserted count + a downloadable **Error Report CSV** if any row was skipped (unknown user/role).

3. **Inline help panel** describing the CSV contract and listing valid scope values.

## Error handling contract (no silent fail)

Every step surfaces failures via `sonner` toast + inline UI state:

| Step | Failure | User-visible result |
|---|---|---|
| File read | Wrong MIME / >2MB / read error | Red toast: "Could not read file: <reason>" |
| CSV parse | Missing required header (`email`, `role_code`) | Red banner above textarea + toast |
| CSV parse | Bad row (missing email/role_code, bad date, invalid scope_type) | Row appears in "Invalid rows" bucket with reason; not sent |
| Preview RPC | Supabase error | Red toast with `error.message`; Apply disabled |
| Apply | Supabase insert error | Red toast with `error.message`; rows are NOT counted as inserted |
| Apply | Partial — server skipped rows server-side | Yellow toast: "X applied, Y skipped — download report" |
| Download | Network/permission error | Red toast |

No `try { ... } catch {}` swallowing. Every catch shows a toast and logs to `console.error` with a stable prefix `[IAC.bulk]`.

## Technical Plan

### New types (extend `src/services/iac/types.ts`)
```ts
export interface IacBulkExportRow {
  email: string;
  role_code: string;
  scope_type: IacScopeType;
  scope_id: string | null;
  expires_at: string | null;
  assigned_at: string;
}
export type BulkRowIssue =
  | 'unknown_user' | 'unknown_role' | 'duplicate'
  | 'missing_email' | 'missing_role' | 'bad_scope' | 'bad_date';
export interface ParsedBulkRow {
  raw: Record<string,string>;
  row: IacBulkAssignmentRow | null;
  issues: BulkRowIssue[];
  lineNo: number;
}
```

### Service layer (`src/services/iac/iacService.ts`) — add:
- `exportAssignments(): Promise<IacBulkExportRow[]>` — paginated fetch (1000-row chunks per Core memory) joining role + profile email; returns flat rows.
- `getTemplateCsv(): string` — header + example.
- Reuse existing `previewBulk` and `applyBulk` (already idempotent).

### CSV utility (`src/lib/iac/csv.ts`) — new file:
- `serializeCsv(rows, headers)` — proper quoting (escape `,`, `"`, newline).
- `parseCsv(text): { headers, rows }` — RFC-4180-ish parser, handles quoted fields. No external dep.
- `validateBulkRow(row, lineNo): ParsedBulkRow` — checks required fields, scope enum, ISO date.

### Hook (`src/hooks/useIac.ts`) — add:
- `useExportAssignments()` (lazy `useMutation` so it triggers on click).
- `usePreviewBulk()` for live preview.

### UI (`src/pages/admin/IdentityAccessConsole.tsx`) — rewrite `BulkTab`:
- Section "Download": two `Button`s wired to mutations. Clicking triggers `serializeCsv` → `Blob` → anchor download. Toast on success.
- Section "Upload": file `<input type="file" accept=".csv">` + textarea. On change/paste → `parseCsv` → `validateBulkRow[]` → `previewBulk` → render preview table (Ready / Invalid / Unknown user / Unknown role / Duplicates).
- "Apply" button shows loading spinner; only enabled when Ready > 0.
- After apply: if any non-ready rows, generate error-report CSV (`email,role_code,reason`) and offer "Download error report" link in the success card.

### Tests (`src/test/iac/bulkCsv.test.ts`) — new
- Parses a CSV with quoted fields, embedded commas, CRLF.
- Round-trip: `serializeCsv(parseCsv(x)) === x` for the canonical export shape.
- `validateBulkRow` returns `bad_scope` for `xyz`, `bad_date` for `2026-13-40`, `missing_email` for empty.
- Mock data: 5 sample rows covering all four preview buckets.

### Documentation
- Update `DOCUMENTATION.md` Bulk section with new contract + error matrix.
- Update `mem/architecture/security/identity-access-console.md` Phase 2 → add "Bulk: round-trip CSV download/upload with structured preview and per-row error CSV export."

## Files
- **New**: `src/lib/iac/csv.ts`, `src/test/iac/bulkCsv.test.ts`
- **Edit**: `src/services/iac/types.ts`, `src/services/iac/iacService.ts`, `src/hooks/useIac.ts`, `src/pages/admin/IdentityAccessConsole.tsx`, `DOCUMENTATION.md`, `mem/architecture/security/identity-access-console.md`

## Acceptance criteria
1. Download Assignments CSV produces a file that, if uploaded back unchanged, yields **0 Ready / N Duplicates** (round-trip verified).
2. Uploading a malformed CSV never silently succeeds — every problem appears in the preview or as a red toast.
3. Apply button shows exact insert count in label; toast confirms inserted vs skipped.
4. Skipped rows can be downloaded as an error-report CSV with a `reason` column.
5. All new tests pass.
