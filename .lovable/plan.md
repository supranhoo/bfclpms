# Edit User Dialog — Fit-Everything Redesign

## Problem (from your screenshot)

The dialog opens at ~895×820 px with **5 sections stacked vertically** inside an internal `ScrollArea`. Result:
- "Access & Status" header is visible but its fields are clipped.
- "Module Access & Login" section is **entirely hidden** below the fold.
- The inner scrollbar is on the right edge of the scroll area, not on the page — users don't realise they can scroll inside the dialog and reach for browser zoom-out instead.

Same issue applies to the **Add New User** dialog (identical layout, ~6 sections).

## Goal

Every field must be reachable **without browser zoom and without hunting for an inner scrollbar**, on a typical laptop (1366×768 and up).

## Solution — Tabbed layout, wider dialog, no inner scroll on common screens

### A. Structural changes (`src/pages/admin/UserManagement.tsx`, both Edit & Create dialogs)

1. **Widen dialog**: `max-w-3xl` → `max-w-5xl` (1024 px). Use full available width up to that cap; on mobile it stays full-width via shadcn's default.
2. **Replace stacked sections with `Tabs`** (shadcn `Tabs` already in the project):
   - **Tab 1 — Profile**: Personal Information + Organization (the 2 most-used groups, fits in one screen as 2-column grid).
   - **Tab 2 — Access**: Access & Status (legacy single-role) + Module Access & Login shortcuts (Roles / Password / Activity).
   - **Tab 3 — Activity** (Edit only): inline mini-recap (last login, last password rollout date, role count) — read-only summary so admin sees state without opening the side sheet.
   - Add Dialog has the same Profile + Access tabs (no Activity tab — user doesn't exist yet).
3. **Tabs header sticks** to the top of the dialog body; **footer (Cancel / Save) sticks** to the bottom. Body uses `min-h-[420px]` so tab switches don't reflow the dialog height. Remove the inner `ScrollArea` — each tab's content is short enough to fit. A safety `overflow-y-auto` stays on the body for sub-1366px laptops, but with tabs each tab is ~3-4 rows, so it almost never triggers.
4. **Required-field markers** kept; add a small "Required *" legend in the dialog header so the asterisks aren't ambiguous.
5. **Section icons** (Users, Package, Shield, KeyRound) reused as **tab triggers**, so the visual language stays consistent with today's section headers.

### B. UX polish carried in the same pass

- The "Module Access & Login" three-button row becomes the **whole Access tab body** (large, obvious buttons with descriptions: "Grant module roles", "Send/reset password", "View access history") — no more hiding in a sub-card.
- Account Status switch and legacy single-role dropdown move into a tidy left column on the Access tab; right column shows current IAC role count + a "Manage in detail →" hint pointing to the Roles button.
- Save / Cancel footer gets a subtle border-top to anchor visually.

### C. Reuse, don't duplicate

- The Create dialog reuses the **same `<UserDialogTabs />` extraction** so future fields only need editing in one place. New file: `src/components/admin/UserDialogShell.tsx` (a thin wrapper exposing `mode: 'create' | 'edit'` + slot per tab).
- All existing state hooks (`editFullName`, `newFullName`, etc.) stay untouched — only JSX moves.

## Risk & Impact

- **Data impact:** none. Pure UI restructuring; no field renames, no validation changes.
- **Workflow impact:** none — same fields, same submit handler. Tab switching is local state.
- **UI/UX consistency:** matches the tabbed pattern already used in `UserAccessSheet` (Roles / Password / Audit), so admins get one mental model across both surfaces.
- **Regression risk:** low. The two areas touched are inside the dialogs only; row actions, filters, and lists are untouched. If a tab is empty (e.g. you remove a tab later) the body just collapses to its min-height.
- **Mitigation:** retain `overflow-y-auto` on the tab body as a safety net for very small viewports; smoke-test Create + Edit + the new Access tab buttons (each opens `UserAccessSheet` on the right tab as today).

## What I won't change

- The data model, save logic, or `handleSaveUser` / `handleCreate` flows.
- The IAC service layer or `UserAccessSheet`.
- Mobile breakpoints — the dialog is already responsive; tabs make it *more* compact on mobile, not less.

If this looks good I'll implement it in one pass and verify the build.
