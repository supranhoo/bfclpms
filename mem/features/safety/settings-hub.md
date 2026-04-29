---
name: Safety Settings Hub (Phase X)
description: safety_settings key-value table, get/set RPCs, and /safety/settings hub UI for zero-hardcoded business variables
type: feature
---
# Safety Settings Hub — Cross-cutting Phase X

## Table
- `public.safety_settings (key text PK, value jsonb, description, updated_at, updated_by)`
- RLS: any authenticated user can SELECT; only admin/safety_head can INSERT/UPDATE/DELETE.
- BEFORE-trigger `safety_settings_touch` auto-stamps `updated_at` and `updated_by = auth.uid()`.

## Seeded keys (zero-hardcoding rule)
- `ptw_expiry_warning_hours` (number, default 2)
- `training_overdue_escalation_days` (number, default 3)
- `audit_compliance_thresholds` (object `{excellent, good, fair}`, default 90/75/60)
- `emergency_ack_window_minutes` (number, default 5)
- `drill_required_per_year` (number, default 4)
- `asset_calibration_alert_days` (int[], default [7,1,0])

## RPCs
- `get_safety_setting(p_key text) → jsonb` — STABLE; readable by anyone.
- `set_safety_setting(p_key, p_value, p_description?) → { ok, error?, key, value }` — admin/safety_head only.

## SSOT (`src/lib/safetySettings.ts`)
- `SAFETY_SETTING_DEFAULTS` mirrors DB seeds (typed source of truth).
- Coercers: `asNumber` (treats null/undefined as fallback, not 0), `asIntArray`, `asComplianceThresholds` (enforces excellent>good>fair, 0–100).
- `parseSettingJson(input)`: returns `{value}` or `{error}` for UI validation.
- `formatSettingValue(v)`: 2-space indented JSON for editor.

## UI
- `/safety/settings` — grid of admin destinations (Users, Permit Types, SLA Monitor, Audit Log, Hours Worked, Emergency Contacts, Training Admin) + per-key JSON editor with dirty badges and add-new form.

## Tests
`src/test/safetySettings.test.ts` — 8/8 covering coercers, threshold validation, JSON parser/formatter, key whitelist.
