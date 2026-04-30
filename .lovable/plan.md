
# Plan: Mobile-Friendly Safety Module (Entry-Level User Focus)

## Goal
The Safety module currently uses desktop-first patterns (wide tables, fixed paddings, multi-column filter grids, inline action rows). Entry-level users — **Workers**, **Supervisors**, **Safety Officers** — work primarily from phones (shop-floor, site, plant). This plan makes every Safety surface they touch usable one-handed on a 360–414px screen, while keeping the existing desktop behavior intact at `md+`.

## Scope (entry-level user surfaces — priority 1)
1. `/safety` — Safety Home (KPI tiles, stage/severity, overdue queue)
2. `/safety/incidents` — list + filters
3. `/safety/incidents/new` — **Report Incident** (the most-used worker action)
4. `/safety/incidents/:id` — detail + timeline + stage actions
5. `/safety/permits` & `/safety/permits/new` — request/approve flow
6. `/safety/training` — My Training (reader + quiz)
7. `/safety/emergency` — drill log + contacts
8. `/safety/audits` — runs list (supervisor view)

Admin surfaces (`/safety/training/admin`, `SafetyUsers`, `SafetyHoursWorked`, `SafetyPermitTypeConfig`, `SafetyAuditTemplates`, `SafetySettings`) stay desktop-first — they are not entry-level workflows. We will only ensure they don't horizontally overflow on a phone.

## Risk & Impact Report
- **Data Impact:** None. UI/CSS-only.
- **Workflow Impact:** None. No permission, FSM, or RLS change.
- **UI/UX Consistency:** Desktop layouts preserved at `md:` breakpoint and above. Mobile gets dedicated card variants.
- **Regression Risk:** Medium — touches every Safety page shell. Mitigated by:
  - Reusing the existing `useIsMobile()` hook (single SSOT for breakpoint).
  - All changes scoped under `src/components/safety/**` and `src/pages/safety/**` — PMS shell untouched (per `mem/architecture/safety/module-shell-isolation`).
  - New components shipped behind small, additive props (no breaking signature changes on `SafetyDataTable` / `SafetyFilterBar`).
- **Mitigation:** Add `src/test/safetyMobileLayout.test.tsx` snapshotting card variants at 375px; keep existing `safetyShellIsolation.test.tsx` green.

---

## Design Standards (new memory: `mem://design/safety-mobile-ux`)
| Rule | Spec |
|---|---|
| Breakpoint | `useIsMobile()` < 768px → mobile card variant; ≥ 768 → existing table |
| Touch target | min 44×44 px on all buttons/links a worker taps (matches `SafetySidebar` floating trigger) |
| Page padding | `p-3 sm:p-6` everywhere (already in `SafetyLayout`, enforce in pages) |
| Header H1 | `text-xl sm:text-2xl`, icon `h-5 w-5 sm:h-6 sm:w-6` |
| Primary CTA | Sticky bottom bar on mobile (`fixed bottom-0 inset-x-0 p-3 border-t bg-background z-40`) for "Report Incident", "Submit", "Request Permit" |
| Filter bar | Collapse to a single-column accordion on mobile; "Filters" trigger shows active-count badge |
| List rows | `<table>` replaced by stacked `<Card>` on mobile (number, title, severity chip, SLA chip, status, tap → detail) |
| Forms | All inputs full-width, label above; Select uses native sheet on mobile via existing Radix |
| File upload | Big tappable drop-zone, camera capture hint (`accept="image/*" capture="environment"`) for incident evidence |
| Sidebar | Already mobile-OK (off-canvas via `Sheet`, floating trigger, `min-h-[44px]`) — no change |

---

## Implementation Steps

### Step 1 — Shared mobile primitives (new files)
- **`src/components/safety/SafetyMobileListCard.tsx`** — Stacked card row used by Incidents/Permits/Audits/Drills lists. Props: `title`, `subtitle`, `meta` slots, `badges`, `onClick`. Mirrors `MobileSelfReviewCard.tsx` styling so PMS and Safety feel like one product.
- **`src/components/safety/SafetyResponsiveList.tsx`** — Wrapper that picks `<Table>` (children) on `md+` and renders `SafetyMobileListCard[]` (via a `mobileItems` render-prop) on mobile. Replaces ad-hoc `useIsMobile` branching across pages.
- **`src/components/safety/SafetyStickyActionBar.tsx`** — `fixed bottom-0` bar shown only on mobile. Used by `SafetyIncidentNew`, `SafetyPermitNew`, `SafetyIncidentDetail` (stage actions).
- **`src/components/safety/SafetyFilterSheet.tsx`** — Mobile variant of `SafetyFilterBar`: collapses filters into a `<Sheet>` triggered by a "Filters (n)" button. Desktop keeps the existing inline grid.

### Step 2 — Update `SafetyFilterBar`
- Add `mobileCollapsed?: boolean` (default true). When true and `useIsMobile()`, render trigger button + Sheet; otherwise render current inline form.
- Shows badge with count of non-default filters.

### Step 3 — Update `SafetyDataTable`
- Add optional `mobileRender?: (row) => ReactNode` + `rows` prop.
- When mobile and `mobileRender` provided, render a `<div className="divide-y">` of `SafetyMobileListCard`s instead of the `<Table>` children.
- Pagination footer becomes a sticky compact strip on mobile (Prev / `Page X/Y` / Next; rows-per-page hidden on mobile, defaults to 25).

### Step 4 — Page-by-page adoption (entry-level surfaces)
For each page below: replace the inline table block with `SafetyResponsiveList` and pass a `mobileRender` returning `SafetyMobileListCard`. Move primary CTA into `SafetyStickyActionBar` on mobile.

- `SafetyHome.tsx`
  - KPI grid already `grid-cols-2 lg:grid-cols-4` ✅
  - "By Stage" rows: shrink label to `w-24` on mobile, hide `pct` bar label
  - "Overdue" / "Recent" rows: stack `SafetyStatusBadge` + `SlaBadge` under title on mobile
  - Move "Report Incident" header button into a sticky bottom CTA on mobile

- `SafetyIncidents.tsx`
  - Filters → `SafetyFilterSheet`
  - Table → mobile cards: `#number` + title (line-1), `type · severity · location` (line-2), `<StatusBadge> <SlaBadge>` (line-3)
  - Sticky "Report Incident" bottom CTA

- `SafetyIncidentNew.tsx`
  - Stack form fields full-width; Type & Severity selects become 1-col on mobile
  - Evidence upload: large drop-zone with `capture="environment"` so Android/iOS open camera
  - Submit → sticky bottom bar; show offline badge inline above bar when `!isOnline`

- `SafetyIncidentDetail.tsx`
  - Two-column desktop layout collapses to single column; Timeline becomes vertical card stack
  - `StageActionPanel` actions move into sticky bottom bar on mobile

- `SafetyPermits.tsx`, `SafetyPermitNew.tsx`, `SafetyPermitDetail.tsx`
  - Same pattern: cards on mobile, sticky CTA, single-column form

- `SafetyTraining.tsx`
  - Assignment list → tappable cards (already cardish; tighten paddings)
  - Reader: progress bar sticky-top on mobile; "I have read" button sticky-bottom
  - Quiz: one question per screen on mobile (stepper), submit sticky-bottom

- `SafetyEmergency.tsx`, `SafetyEmergencyContacts.tsx`
  - Contacts: tap-to-call (`<a href="tel:...">`) cards on mobile
  - Drill log: cards instead of table

- `SafetyAudits.tsx`
  - Cards on mobile; supervisor "Start Run" sticky CTA

### Step 5 — `SafetyLayout` polish
Already good after the last sidebar refactor. Two small fixes:
- Add `pb-24 md:pb-0` to `<main>` so sticky bottom bars don't cover content
- Ensure floating `SidebarTrigger` has `safe-area-inset-top` padding for iOS notch

### Step 6 — Tests & docs
- New `src/test/safetyMobileLayout.test.tsx` — renders `SafetyResponsiveList` at 375px, asserts cards present and `<Table>` not rendered; at 1024px asserts the inverse.
- Update `src/test/safetyShellIsolation.test.tsx` — assert sticky CTA bars render only inside `data-testid="safety-shell"`.
- Update `DOCUMENTATION.md` (Safety section) and add `mem/design/safety-mobile-ux.md`.
- Bump version: `v2.66.7.49 — Safety mobile-friendly entry-level UX`.

---

## ASCII Layout Reference
```text
Mobile (< 768px) — Incidents list           Desktop (≥ 768px)
┌────────────────────────────┐             ┌──────────────────────────────────────┐
│ ☰  Safety                  │             │ │Sidebar│  Safety Incidents          │
│ Safety Incidents           │             │ │       │  ┌Filters───────────────┐  │
│ [Filters (2)]              │             │ │       │  │ Status │ Sev │ Type  │  │
│ ┌────────────────────────┐ │             │ │       │  └──────────────────────┘  │
│ │ INC-104 · Slip in shop │ │             │ │       │  ┌────Table────────────┐   │
│ │ Near miss · High · Bay3│ │             │ │       │  │ # │ Title │ Sev │…  │   │
│ │ [Investigation] [Amber]│ │             │ │       │  └─────────────────────┘   │
│ └────────────────────────┘ │             │ │       │                            │
│ … more cards …             │             └──────────────────────────────────────┘
│                            │
│ ──────────────────────────│
│ [+ Report Incident] (CTA) │  ← sticky
└────────────────────────────┘
```

## Files Touched (summary)
**New:** `SafetyMobileListCard.tsx`, `SafetyResponsiveList.tsx`, `SafetyStickyActionBar.tsx`, `SafetyFilterSheet.tsx`, `safetyMobileLayout.test.tsx`, `mem/design/safety-mobile-ux.md`
**Edited:** `SafetyFilterBar.tsx`, `SafetyDataTable.tsx`, `SafetyLayout.tsx`, all 8 entry-level pages listed above, `safetyShellIsolation.test.tsx`, `DOCUMENTATION.md`, `mem/index.md`

**Out of scope (this round):** Admin pages (Users, Hours Worked, Permit Types, Audit Templates, Training Admin, Settings) — only safe overflow fixes.

Approve to proceed?
