

User wants:
1. The view-mode toggle strip (image 1 — "My Dashboard / Team Reviews / Self Review / ..." horizontal bar) to have a **blue background** like image 2 (the BFCL header).
2. An option in **System Settings → General** to change that strip's color.

This is dynamic configuration (zero-hardcoding rule) — must store color in `app_settings`, not hardcode.

Let me check the existing structure quickly.

Files involved:
- `src/components/review/ViewModeToggle.tsx` — the strip component (currently `bg-muted/50`)
- `src/hooks/useAppSettings.ts` — needs new field `view_mode_strip_color` (hex)
- `app_settings` table — needs new column `view_mode_strip_color text`
- System Settings → General page — need to find it and add a color picker
- DOCUMENTATION.md / POLICY.md — version bump

Need to check System Settings General page location.

Plan:

## Add Configurable Blue Strip for View Mode Toggle

### What Changes

1. **DB Migration** — add `view_mode_strip_color text default '#3b82f6'` to `app_settings`. Nullable-safe with default blue (matches image 2 BFCL header blue).

2. **`useAppSettings.ts`** — extend `AppSettings` interface + update mutation typing to include `view_mode_strip_color`.

3. **`ViewModeToggle.tsx`** — read color from `useAppSettings()`, apply as inline `style={{ backgroundColor }}` on the wrapper. Active button gets white background + colored text for contrast (like image 2's "Self Review" pill). Inactive buttons: white/light text on the colored strip.

4. **System Settings → General** (locate the existing General settings page under `/admin/settings` → General tab) — add a new "View Mode Strip Color" row with:
   - HTML5 color picker (`<input type="color">`)
   - Hex text input synced with picker
   - Live preview chip
   - "Reset to default" button (#3b82f6)
   - Save handler uses existing `useUpdateAppSettings`

5. **Docs** — bump to `v2.65.0`, document new branding setting + policy entry that strip color is admin-configurable.

### Risk & Impact

| Area | Impact |
|------|--------|
| Data | Additive column, default-safe; no historical data touched |
| Workflow | None |
| RLS | `app_settings` already has admin-only update RLS — reused |
| UI/UX | Strip changes visual style only; layout/sizing unchanged. Active-pill contrast maintained on any color via white pill |
| Regression | Low — `ViewModeToggle` only used in review pages; falls back to default blue if setting missing |
| Mitigation | Default value ensures no null state; color contrast handled via fixed white active-pill |

### Files

| File | Change |
|------|--------|
| `supabase/migrations/<new>.sql` | NEW — add `view_mode_strip_color` column with default |
| `src/hooks/useAppSettings.ts` | Add field to interface + mutation type |
| `src/components/review/ViewModeToggle.tsx` | Apply dynamic bg color, adjust active/inactive button styles for contrast |
| `src/pages/admin/SystemSettings.tsx` (General tab) | Add color picker control |
| `DOCUMENTATION.md`, `POLICY.md` | v2.65.0 entry |

### Default
`#3b82f6` (Tailwind `blue-500`) — matches image 2 BFCL header tone.

