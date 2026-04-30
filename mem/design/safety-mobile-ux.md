---
name: Safety Mobile UX
description: Mobile-first patterns for Safety entry-level users (Workers, Supervisors, Safety Officers) — mobile primitives, breakpoints, sticky CTAs, camera capture
type: design
---

# Safety Mobile UX (entry-level workflows)

Safety entry-level users (Workers, Supervisors, Safety Officers) work primarily from phones on the shop-floor / site. Every Safety surface they touch must be usable one-handed at 360–414px while preserving the desktop experience at `md+`.

## Breakpoint
- Single SSOT: `useIsMobile()` from `src/hooks/use-mobile.tsx` (< 768 px = mobile).
- Never branch on `window.innerWidth` directly inside Safety pages.

## Mobile primitives (all in `src/components/safety/`)
| Component | When to use |
|---|---|
| `SafetyMobileListCard` | Mobile replacement for table rows (Incidents, Permits, Audits, Drills, Training assignments). Min-h 88px, full card is the tap target. |
| `SafetyResponsiveList` | Drop-in for `SafetyDataTable` when you have a `mobileRender` prop. Renders `<Table>` on `md+`, stack of cards on mobile. Compact pager (Prev / Page X/Y / Next) on mobile. |
| `SafetyStickyActionBar` | Fixed bottom bar for the primary CTA (Report Incident, Submit, Request Permit). Renders only on mobile unless `forceVisible`. Honours iOS safe-area inset. |
| `SafetyFilterSheet` | Mobile-first variant of `SafetyFilterBar`. Inline grid on `md+`; collapses to a "Filters (n)" trigger + bottom Sheet on mobile. |

## Layout rules
- `SafetyLayout`'s `<main>` already has `pb-24 md:pb-6` so sticky CTAs never cover content. Don't override.
- Page padding: `p-3 sm:p-6`.
- Page title: `text-xl sm:text-2xl` (or `sm:text-3xl` for hub pages).
- Title icon: `h-5 w-5 sm:h-6 sm:w-6`.
- Header CTA (e.g. "Report Incident") is `hidden md:inline-flex` — the same action lives in the sticky action bar on mobile.
- All form inputs/selects on mobile use `h-11` (44px touch target).

## Worker-flow specifics
- **Incident report evidence (`SafetyIncidentNew`):** two big drop-zones — "Take photo" (`<input type="file" accept="image/*" capture="environment">`) and "Upload files". Each min-h 88px. Capture attribute opens the camera directly on Android/iOS.
- **Emergency contacts:** every phone number is a `<a href="tel:...">` with min-h 36px and a 📞 prefix so it reads as tappable on mobile.
- **Forms with sticky submit:** wrap the `<form>` with an `id` and submit from `SafetyStickyActionBar` via `<Button type="submit" form="...">`.

## Regression guard
`src/test/safetyMobileLayout.test.tsx` — verifies `SafetyMobileListCard` exposes a tappable button and `SafetyStickyActionBar` renders only on mobile (or with `forceVisible`).

## Out of scope
Admin surfaces (`SafetyTrainingAdmin`, `SafetyUsers`, `SafetyHoursWorked`, `SafetyPermitTypeConfig`, `SafetyAuditTemplates`, `SafetySettings`) stay desktop-first — they are configuration tools, not entry-level workflows. Only ensure they don't horizontally overflow.