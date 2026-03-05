

# Update DOCUMENTATION.md and POLICY.md — Sync with Recent Changes

You're correct. The custom knowledge rules require **atomic sync** — every code change must update both documents simultaneously. The following changes were made without updating the docs:

1. **Bug Bounty Fixes** (BUG-001 through BUG-009) — 7 code fixes, unit tests, DB migration for `skip_level` enum
2. **Frequency Lock Data Correction** — migration to fix quarterly/bi-monthly KPIs on locked months, import/creation logic updates, trigger enhancement
3. **BUG-006 & BUG-009** — QueryInbox unread count fix, Dashboard lazy-load fix

None of these are reflected in either document.

## Changes Required

### DOCUMENTATION.md

**Update header** (line 3-4): Version bump to `1.48.0`, date to `2026-03-05`, summary mentioning bug bounty fixes and frequency lock correction.

**Add new Version History entry** at the end (before the closing line 3855) documenting:

- **v1.48.0** — Bug Bounty audit fixes:
  - `UserManagement.tsx`: Imported canonical `AppRole` from `@/lib/roles`, added `hr_pms` and `skip_level` role support (colors, filter dropdown, assignment). DB migration added `skip_level` to `app_role` enum.
  - `UserManagement.tsx`: Added email regex validation and whitespace trimming to `handleCreateUser`.
  - `PolicyRenderer.tsx`: Added `escapeHtml()` sanitization before `dangerouslySetInnerHTML` rendering.
  - `SendBackDialog.tsx`: Added `maxLength={2000}` with character counter.
  - `TieredOptionsBuilder.tsx`: Replaced array-index React keys with stable composite keys.
  - `UserManagement.tsx`: Pagination resets to page 1 on filter/search change.
  - `QueryInbox.tsx`: Replaced local `useMemo` unread count with server-side `useUnreadNotificationCount()` hook.
  - `Dashboard.tsx`: Lazy-loads `allSubmissions` query — only fetches when KPI review panel is open.
  - Created `src/test/bugBountyFixes.test.ts` with 11 regression tests.

- **Frequency lock data correction**: Migration corrected `review_period` for quarterly/bi-monthly KPIs stuck on locked months. Updated `import-kpis` edge function and `AdminKpiCreateDialog` with `resolveToActiveMonth` logic. Enhanced DB trigger to block INSERT of KPIs with locked-period review_period.

**Update relevant sections** in the body:
- Section on `UserManagement` — note all 7 roles are now supported
- Section on Dashboard — note lazy-loading of `allSubmissions`
- Section on `PolicyRenderer` — note HTML escaping

### POLICY.md

**Add version history entries** for:
- v1.5.0: Frequency lock policy — KPI import/creation now auto-resolves multi-month frequency periods to terminal month. DB trigger blocks INSERT of KPIs with locked-month review_period.
- v1.6.0: Bug bounty fixes — role coverage, validation hardening, XSS sanitization, pagination reset, unread count accuracy, dashboard performance.

**Add new section §22: Frequency Period Auto-Resolution Policy**:
- When creating/importing KPIs with multi-month frequencies (Quarterly, Bi-Monthly, Half-Yearly, Annual), the system auto-resolves `review_period` to the cycle's active terminal month.
- DB trigger enforces this at INSERT time for non-admin users.

## Files to Modify
1. `DOCUMENTATION.md` — header version bump + version history entry + inline section updates
2. `POLICY.md` — new §22 + version history entries

