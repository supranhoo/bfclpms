---
name: scoring-model-group-owned
description: Per-employee KPI tuning may change scope only; scoring model (type, options, R0-R5, direction, threshold mode) is group-owned (ADR-282)
type: feature
---
Performance Console "Tune" (`RowOverrideDialog`) is type-aware via `resolveKpiScoringModel`.
- Tunable per employee: weightage, target, frequency + cycle anchor, day counting, source of data. Value-based KPIs additionally: unit, direction, R0–R5.
- Never per employee: `uom_type`, `qualitative_options`, `threshold_mode`; plus `r0..r5`/`criteria`/`uom` when the KPI is binary or tiered.
- Client mirror: `src/components/admin/bu-console/rowOverrideModel.ts`. Server SSOT: `public.bu_console_scoring_model_lock` — returns `scoring_model_locked`, surfaced as a skipped row, never a mid-run abort.
- `bu_console_validate_changes` also validates `qualitative_options` shape (non-empty array of `{label, rating 0..5}`).
- Binary/tiered tuning shows a read-only `KpiScoringScale` plus a shortcut to the group definition editor.
Tests: `rowOverrideModel.test.ts`.
