---
name: Image Compression Policy
description: Client-side image compression defaults, skip rules, and severity overrides for Safety + PMS evidence uploads
type: feature
---
# Image Compression (Phase A — Client)

**Scope:** Single global system setting governs Safety AND PMS evidence uploads.

## Settings (system_settings)
- `image_compression_enabled` (bool, default `true`) — master toggle.
- `image_compression_policy` (jsonb) — `{ quality, severeQuality, maxSizeMB, maxWidthOrHeight }`.
  - Defaults: `quality=0.82`, `severeQuality=0.92`, `maxSizeMB=1.5`, `maxWidthOrHeight=2560`.
  - Admin UI: System Settings → Upload Settings tab → Image Compression card.

## Wrapper: `src/lib/imageCompression.ts` → `compressImageFile(file, opts)`
Always returns a `File` — never throws upstream; on failure returns the original.

### Skip rules (return original, `wasCompressed=false`)
- Disabled via setting
- Non-image MIME
- Size < 300 KB
- Animated GIF (`image/gif`)
- PNG with non-trivial alpha channel (sparse pixel scan)

### Special handling
- HEIC/HEIF → re-encoded to JPEG (iOS compatibility).
- Severity hint `high`/`critical` (Safety) → uses `severeQuality` (0.92).

## Wired call sites
- Safety: `submitSafetyIncident`, `SafetyIncidentNew`, `useSafetyOfflineSync`, `useSafetyIncidentDetail`.
- PMS: `EvidenceUpload.tsx`, `useUploadEvidence.ts`.

## UX
- "Optimizing…" state on upload buttons.
- Toast "Saved X MB · Y% smaller" only when savings ≥30% AND original ≥500 KB.

## Phase B (deferred)
Server-side WebP re-encode via edge function + `compression_status` columns on evidence tables. Not yet implemented.
