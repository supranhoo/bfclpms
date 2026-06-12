# Safety Incident Management — Enhancement Plan

This is a large, multi-area request that touches schema, RPC, RLS, workflow, UI, exports, and audit. Per project rules (SSOT, surgical changes, RCA, scalability, backup coverage, no hardcoding), I'm splitting it into **6 phases** that can ship & be verified independently. Please confirm scope/order before I start phase 1.

---

## Assumptions

1. **Roles already exist**: BU Head (Manager-tier in Safety RBAC), Safety Head, Reporter, Assigned User — I'll reuse the existing `safety_user_roles` matrix, not create new ones.
2. **"Actual Reporter"** is a free reference to an employee in `profiles` (by `id`), not an auth user. They do not get notified or gain access; they're metadata only.
3. **Duplicate workflow** introduces a new terminal-bound status `duplicate` that bypasses Manager/Assigned-User stages and routes straight to Safety Head closure. Original incident is **not** modified — only linked.
4. **Evidence rename** changes `file_name` (display) only. `file_path` in storage is immutable. Original filename is preserved in a new `original_file_name` column for audit.
5. **Excel export** = real `.xlsx` (SheetJS) for Safety Head, not CSV. The existing `SafetyDataExportDialog` (CSV, admin-only) stays as-is; Safety Head gets a dedicated filtered export from the incidents list.
6. **Advanced filters** extend the existing `SafetyFilterSheet` on `/safety/incidents`. Same component is reused by BU Head and Safety Head views — visibility differences are already handled via RLS.
7. **Backup**: all new columns/tables auto-covered via `get_backup_table_order()` (per Core memory). No denylist entries.

## Clarifications needed (please answer before I start)

1. **Q1 — Duplicate closure SLA**: when an incident is marked `duplicate`, should the original SLA clock stop (treat as closed for SLA purposes) or keep ticking until Safety Head confirms? My recommendation: **stop the SLA at the moment of marking** (status becomes terminal-equivalent), and Safety Head closure is governance only.     
answer: the duplicate sla clock should only stop when the safety head closes the duplicate ticket.  

2. **Q2 — Who can mark duplicate**: spec says "BU Head". Should the **Assigned User** also be allowed (they often spot the duplicate first), or strictly BU Head only?  
answer: Only the BU Head can mark  

3. **Q3 — Evidence rename permission**: who can rename — only the uploader, or anyone with edit access to that incident stage? Recommendation: **uploader + Safety Head + Admin** (audit-logged).  
answer: uploader only
4. **Q4 — Export row cap**: existing CSV export caps at 50,000. Safety Head Excel export — same cap, or smaller (10k) since Excel renders worse at high volumes?  
answer: best optimized 

## Risk & Impact Report (overall)


| Area        | Impact                                                                                                                                                                                                                   | Mitigation                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Data        | New nullable columns on `safety_incidents` (`actual_reporter_id`, `duplicate_of_id`, `marked_duplicate_by`, `marked_duplicate_at`, `duplicate_remarks`); new column on `safety_incident_evidence` (`original_file_name`) | All additive, nullable, no backfill needed                                                             |
| Workflow    | New `duplicate` status branches workflow tree                                                                                                                                                                            | Server-side trigger validates only BU Head/Safety Head can transition; status enum extended additively |
| RLS         | New policies for duplicate-marking + evidence rename                                                                                                                                                                     | Reuse `has_safety_role()` helper; no new role added                                                    |
| Audit       | All new actions write to `safety_audit_log`                                                                                                                                                                              | Centralized in RPCs, not client                                                                        |
| Backup      | Auto-covered (additive columns, no new tables in phase 1–3)                                                                                                                                                              | Verified via existing contract                                                                         |
| Regression  | Filter redesign touches the page most users hit                                                                                                                                                                          | Phase 6 last; preserve existing query keys & URL params                                                |
| Scalability | Date presets compile to indexed `occurred_at` range filters                                                                                                                                                              | Server-paginated; no client-side filtering of full set                                                 |


## Phase plan (each phase = one PR, verifiable independently)

### Phase 1 — "Reported On Behalf Of" (Actual Reporter)

- **DB**: add `actual_reporter_id uuid references profiles(id)` to `safety_incidents`. Extend `report_safety_incident(p_payload)` RPC to accept optional `actual_reporter_id`.
- **UI**: searchable employee picker (reuses existing `ProfileCombobox`) in `SafetyIncidentNew`, labeled "Actual reporter (optional)" with helper "Use if you're filing this on behalf of someone without system access".
- **Display**: incident list (`SafetyIncidents.tsx`) — "Reported" column gains a second line `On behalf of: <name> (<emp>)` when set. Detail page header shows both. Filter exports include `actual_reporter_name` + `actual_reporter_employee_code`.
- **Audit**: RPC writes single `incident.reported` event capturing both ids.
- **Tests**: incidentReportRpc test extended; render test for two-line "Reported" cell.

### Phase 2 — Duplicate Incident Handling

- **DB**: add `duplicate_of_id`, `marked_duplicate_by`, `marked_duplicate_at`, `duplicate_remarks` to `safety_incidents`. Extend status enum with `duplicate` (or use existing status + flag — TBD after Q1).
- **RPC**: new SECURITY DEFINER `mark_incident_duplicate(p_incident_id, p_master_id, p_remarks)` — validates caller is BU Head over the incident's BU, master is open & not itself a duplicate, writes audit, transitions status, stops SLA clock (pending Q1).
- **UI**:
  - BU Head sees "Mark as duplicate" action on incident detail → dialog with master-incident searchable picker (scoped to same BU, open status, exclude self) + required remarks textarea + `ConfirmDestructiveDialog`.
  - Safety Head queue: new "Duplicate closures pending" filter chip; closure dialog shows the master link.
  - Detail page banner on a duplicate: "Marked duplicate of #INC-xxx by &nbsp; on &nbsp;" with link.
- **Tests**: RPC permission test, status-transition test, RLS test that non-BU-Head is rejected.

### Phase 3 — Evidence Rename

- **DB**: add `original_file_name text` to `safety_incident_evidence`; backfill = copy current `file_name` once via migration.
- **RPC**: `rename_incident_evidence(p_evidence_id, p_new_name)` — validates caller is uploader / Safety Head / Admin (pending Q3), updates `file_name`, leaves `file_path` untouched, logs audit.
- **UI**: pencil icon next to each row in `EvidenceList.tsx` → inline rename input with Enter/Esc. Tooltip shows original filename. Downloads use the new display name (stream + `Content-Disposition`).
- **Tests**: storage path unchanged after rename; non-uploader rejected; download header uses new name.

### Phase 4 — Safety Head Excel Export

- **Lib**: new `src/lib/safetyIncidentExcelExport.ts` using SheetJS (`xlsx` is likely already a dep — verify; else `bun add xlsx`). Reuses the same server-paginated query path as the list (1000/batch, 50k cap pending Q4), so it always respects active filters/RLS.
- **UI**: "Export Excel" button on `/safety/incidents` visible only when `useSafetyRole().isSafetyHead || isAdmin`. Disabled while busy; toast on success/error.
- **Columns** (exact spec): Incident ID, Type, Severity, BU, Created By, Reported By, Actual Reporter, Assigned User, Status, SLA Status, Created Date, Closed Date, Closure Remarks.
- **Tests**: column order locked via test; row count matches filtered query; cap warning surfaced.

### Phase 5 — Advanced Date & Multi-Filter

- **UI**: extend `SafetyFilterSheet` filters with:
  - Date preset dropdown: Today / Yesterday / This Week / Last Week / This Month / Last Month / This Quarter / Last Quarter / This Year / Last Year / Custom (shows two date inputs).
  - Multi-select for Type, Severity, Status, BU, Assigned User, SLA Status (using existing `MultiSelectCombobox`).
- **Logic**: preset → `[from, to]` resolver in a new pure `src/lib/safetyDateRangePresets.ts` (Mon-week, fiscal-agnostic; reused later by other Safety pages). All resolution is **server-side** via `.gte/.lte('occurred_at', …)`.
- **State**: filters serialize to URL search params so navigating back preserves state (covers "Saved filter state while navigating" requirement without DB-stored saved views — out of scope unless requested).
- **Tests**: preset boundary tests (DST-safe), multi-select query construction test.

### Phase 6 — Professional Filter UI Redesign

- **Scope**: visual + ergonomic only. No new filter capabilities (those are Phase 5).
- **Changes**:
  - Active filter **chips row** above the table — each chip shows `label: value` with an X to remove just that one.
  - **Clear all** button when ≥1 filter active.
  - Filter sheet on desktop becomes a right-side **Sheet drawer** (not a Card) to free vertical space; mobile unchanged.
  - Sticky filter bar with subtle border + count badge.
  - Search input gets debounced inline search (300ms) — Enter still submits.
- **Out of scope**: server-stored saved views, per-user filter favorites (would need a new table — flag separately if you want it).

---

## Things I will NOT do unless you say so

- ❌ Add a new "Duplicate Manager" role (reuse existing BU Head / Safety Head).
- ❌ Store renamed evidence as new storage objects (wasteful + breaks signed-URL cache).
- ❌ Build a saved-filters table (out of scope; URL params cover the stated need).
- ❌ Refactor `SafetyIncidents.tsx` beyond what each phase requires.
- ❌ Touch the existing CSV export at `/safety/settings`.

---

## Documentation & Policy updates per phase

Every phase will update `DOCUMENTATION.md` (version bump) and, where business rules change (phases 1, 2, 3, 5), `POLICY.md`. New behaviors get a memory file under `mem/features/safety/`.

---

## Ask

Please confirm:

1. **Answers to Q1–Q4** above.
2. **Phase order** (default is 1→6; happy to reorder, e.g. start with Phase 4 export if that's most urgent).
3. **Ship cadence** — one phase per turn (recommended), or batch (Phase 1+3 are small and safe to batch).

Once you confirm, I'll start with Phase 1 end-to-end (migration → RPC → UI → tests → docs).