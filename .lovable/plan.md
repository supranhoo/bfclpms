# Configurable Company Name in Rocket Loading Overlay

## Goal
The "Please wait / Loading…" rocket overlay currently shows generic text. Add a configurable **Company Name** (and optional tagline) that appears beneath the rocket — driven by the existing `system_settings` table, editable by Admins. Zero hardcoding.

## Where it appears

The `PageLoadingOverlay` (rocket card) is shown during page navigation and initial data loads across the entire app.

## Proposed UI

### 1. Loader card (new layout)

```text
┌─────────────────────────┐
│        🚀 (rocket)      │
│                         │
│       ACME CORP         │  ← company_name (bold, brand color)
│   Performance Suite     │  ← company_tagline (muted, optional)
│                         │
│      Please wait        │
│        Loading…         │
└─────────────────────────┘
```

- Company name renders only if a value is set (graceful fallback: today's exact look).
- Tagline renders only if a value is set.
- A small logo (existing `email_company_logo_url` setting, reused) can optionally render above the company name — toggle controlled in admin.

### 2. Admin settings panel

New card on **Admin → Module Hub Settings** (or General Settings) titled **"Branding · Loading Screen"**:

```text
┌─ Branding · Loading Screen ──────────────────────────┐
│                                                      │
│  Company Name           [ ACME CORP            ]     │
│    Shown on the loading overlay across the app.      │
│                                                      │
│  Tagline (optional)     [ Performance Suite    ]     │
│                                                      │
│  Show logo on loader    [ ◯ Off  ● On ]              │
│    Uses the logo configured in Email Branding.       │
│                                                      │
│  ┌─ Live Preview ──────────────┐                     │
│  │       🚀                    │                     │
│  │     ACME CORP               │                     │
│  │  Performance Suite          │                     │
│  │     Please wait             │                     │
│  │       Loading…              │                     │
│  └─────────────────────────────┘                     │
│                                                      │
│                              [ Save Changes ]        │
└──────────────────────────────────────────────────────┘
```

Live preview re-renders on every keystroke so admins see the result before saving.

## Technical Plan

### Data
- Reuse existing `system_settings` table. Three keys (idempotent migration `INSERT … ON CONFLICT DO NOTHING`):
  - `branding_company_name` (string, default `''`)
  - `branding_loader_tagline` (string, default `''`)
  - `branding_loader_show_logo` (bool-as-string, default `'false'`)
- `company_name` already used in PIP letter — this new key is loader-scoped to avoid coupling. (Could later unify; out of scope.)

### Hook
- New `useBrandingSettings()` in `src/hooks/useBrandingSettings.ts` — wraps three `useSystemSetting` calls, parses bool, returns `{ companyName, tagline, showLogo, logoUrl, isLoading }`. Cached via React Query (already configured in `useSystemSetting`).

### Components
- `src/components/ui/PageLoadingOverlay.tsx` — read branding via the new hook; render logo / company name / tagline conditionally above the existing "Please wait / Loading…" block. No layout regression when settings are empty.
- `src/components/ui/RocketGrowthArt.tsx` — unchanged (SVG stays brand-locked).
- `src/components/admin/BrandingLoaderPanel.tsx` (new) — three inputs + switch + live `<PageLoadingOverlay open label=… >` preview rendered in-place (not as fixed overlay; introduce a `variant="inline"` prop on the overlay so the same component can be embedded for preview).
- Wire panel into `src/pages/admin/ModuleHubSettings.tsx` (or whichever existing General Settings page is appropriate — confirmed during build).

### RLS / Security
- `system_settings` already has admin-only write RLS. Read is public (needed so loader can fetch on first paint). No new policies required.

### Tests
- `src/test/branding/loaderBranding.test.tsx` — overlay renders without company name when setting empty, renders with name when set, hides tagline when empty, hides logo when toggle off.
- `src/test/branding/brandingHook.test.ts` — bool parsing for `branding_loader_show_logo`.

### Documentation
- Update `DOCUMENTATION.md` → add "Branding · Loading Screen" section.
- Update `POLICY.md` → note that loader copy is admin-configurable (no hardcoded company identity).

## Risk & Impact Report

- **Data**: New settings keys only; no schema change to existing tables. Zero historical data impact.
- **Workflow**: None — purely cosmetic admin control.
- **UI/UX**: Loader gains 1–3 lines of text. Empty state matches today exactly (safe default).
- **Regression**: Low. Overlay is a memoized presentational component; adding optional rows above existing text. Inline-variant prop kept opt-in to avoid altering current overlay callers.
- **Mitigation**: New unit tests for both empty and populated settings; preview in admin panel prevents misconfiguration.

## Files to Create / Edit

- `supabase/migrations/<ts>_branding_loader_settings.sql` (new)
- `src/hooks/useBrandingSettings.ts` (new)
- `src/components/admin/BrandingLoaderPanel.tsx` (new)
- `src/components/ui/PageLoadingOverlay.tsx` (edit — add branding rows + `variant` prop)
- `src/pages/admin/ModuleHubSettings.tsx` (edit — mount the panel)
- `src/test/branding/loaderBranding.test.tsx` (new)
- `src/test/branding/brandingHook.test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `mem/index.md` (sync)
