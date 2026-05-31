## Goal
Change the rocket body color (currently navy `#0E2A47`, which reads as "black" in the screenshot) to dark orange, and expose it as a configurable setting in the Branding tab so admins can pick any color in the future.

## Risk & Impact
- **Data**: One new `system_settings` key `branding_loader_rocket_color`. Additive. No schema changes.
- **Workflow**: None. Cosmetic only.
- **UI/UX**: Rocket body color changes everywhere `RocketGrowthArt` renders (`PageLoadingOverlay`, `RefreshOverlay`, BrandingLoaderPanel preview). Window/fins/flame remain unchanged.
- **Regression**: Default fallback retains current navy if setting absent — no visual change for projects that haven't configured a color. New default seeded to dark orange (`#C2410C`) per request.
- **Mitigation**: Unit test for `useBrandingSettings` color parsing + fallback; visual snapshot via existing `loaderBranding.test.tsx` pattern.

## Implementation

### 1. Migration — seed default
Insert `branding_loader_rocket_color` = `"#C2410C"` into `system_settings` (idempotent `ON CONFLICT DO NOTHING`).

### 2. `RocketGrowthArt.tsx`
Accept optional `bodyColor?: string` prop. Use it for the rocket body `<path fill>` and the inner window dot (which mirrors body color at 0.35 opacity). Default to `#0E2A47` so direct callers without a color still work.

### 3. `useBrandingSettings.ts`
- Read new key `branding_loader_rocket_color`.
- Add `rocketColor: string` to `BrandingSettings` (default `#C2410C` when unset).
- Add hex validator helper `parseHexSetting(raw, dflt)`.

### 4. `PageLoadingOverlay.tsx` & `RefreshOverlay.tsx`
Pass `bodyColor={branding.rocketColor}` to `<RocketGrowthArt />`. For `PageLoadingOverlay`'s inline preview variant, accept `branding.rocketColor` in its prop shape.

### 5. `BrandingLoaderPanel.tsx` — UI (Branding tab)
Add a new row above the "Show logo" toggle:

```
┌─ Branding · Loading Screen ────────────────────────────────┐
│ Company Name         [ ACME Corporation         ]         │
│ Tagline              [ Performance Suite        ]         │
│                                                            │
│ Rocket Color         [■ #C2410C ] [native color picker]   │  ← NEW
│ Quick presets:  [■ Navy] [■ Dark Orange] [■ Emerald]      │
│                 [■ Crimson] [■ Indigo]    Reset to default│
│                                                            │
│ ☐ Show logo on loader                                     │
│                                                            │
│         [Save Changes]   │   Live Preview → rocket re-tints│
└────────────────────────────────────────────────────────────┘
```

Specifics:
- `<input type="color">` bound to local `rocketColor` state, paired with a read-only hex `<Input>` showing the value.
- Five preset swatch buttons (h-8 w-8 rounded) for one-click selection: Navy `#0E2A47`, Dark Orange `#C2410C`, Emerald `#047857`, Crimson `#B91C1C`, Indigo `#3730A3`.
- "Reset to default" link sets value back to `#C2410C`.
- Live Preview panel on the right re-renders instantly as color changes (already wired via `PageLoadingOverlay` props).
- Save handler adds one more `update.mutateAsync({ key: 'branding_loader_rocket_color', value: rocketColor })`.
- `dirty` check includes `rocketColor !== branding.rocketColor`.

### 6. Tests
- Extend `src/test/branding/loaderBranding.test.tsx`: assert SVG body path uses the configured color when setting is present; falls back to default when absent; invalid hex falls back safely.
- Add unit test for `parseHexSetting`.

### 7. Docs
- `DOCUMENTATION.md` — add "Loader Rocket Color" to Branding settings section + new setting key.
- `POLICY.md` — note rocket color is admin-configurable, default Dark Orange `#C2410C`.

## Files Touched
- `supabase/migrations/<new>_branding_loader_rocket_color.sql` (new)
- `src/components/ui/RocketGrowthArt.tsx`
- `src/hooks/useBrandingSettings.ts`
- `src/components/ui/PageLoadingOverlay.tsx`
- `src/components/ui/RefreshOverlay.tsx`
- `src/components/admin/BrandingLoaderPanel.tsx`
- `src/test/branding/loaderBranding.test.tsx`
- `DOCUMENTATION.md`, `POLICY.md`

## Rollback
Revert files + delete the one settings key. No destructive changes.