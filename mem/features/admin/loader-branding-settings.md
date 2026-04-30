---
name: Loader Branding Settings
description: Configurable rocket-overlay company name, tagline, and logo via system_settings (branding_company_name, branding_loader_tagline, branding_loader_show_logo). Reuses email_company_logo_url. Admin panel at Module Hub Settings with live preview.
type: feature
---

# Loader Branding Settings

The full-screen `PageLoadingOverlay` (rocket card) reads branding from
`system_settings` via `useBrandingSettings()`:

- `branding_company_name` — string, hidden when empty
- `branding_loader_tagline` — string, optional subtitle
- `branding_loader_show_logo` — bool-as-string toggle
- `email_company_logo_url` — reused source for the logo image (no duplicate setting)

## Components

- `src/hooks/useBrandingSettings.ts` — wraps three `useSystemSetting` calls,
  exports `unwrapSettingString` and `parseBoolSetting` helpers.
- `src/components/ui/PageLoadingOverlay.tsx` — accepts `variant: 'fixed' | 'inline'`
  and `branding?: Partial<BrandingSettings>` for previews/tests. Empty branding
  preserves the original card look (regression-safe).
- `src/components/admin/BrandingLoaderPanel.tsx` — admin form with live preview
  mounted on `/admin/module-hub` (ModuleHubSettings page).

## Rules

- Never hardcode company identity strings in the loader; always sourced from
  `system_settings`.
- Logo toggle is gated by presence of `email_company_logo_url` (cannot enable
  with no logo uploaded).
- Tests in `src/test/branding/` cover empty/populated/logo-off/logo-on states.
