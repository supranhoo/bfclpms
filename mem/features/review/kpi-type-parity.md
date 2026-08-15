---
name: KPI Type Parity
description: Binary/tiered/value-based KPI scoring must render per type everywhere (ADR-271)
type: feature
---
Three KPI types exist: numeric (value-based, R0–R5 bands), binary (Yes/No, sometimes inverted so No = 5) and tiered. Any surface that shows or influences a score must resolve the type via `resolveKpiScoringModel` (`src/lib/kpiScoringModel.ts`) and render with `KpiScoringScale` (`src/components/review/KpiScoringScale.tsx`). Never draw a bare 0–5 grid for qualitative KPIs; say "no scoring logic configured" instead of empty bands. Qualitative inputs store the option's 0–5 rating, never `parseFloat(label)`. BU Console group value entry is disabled when a grouped title mixes types. BU Console filters are uncommitted until Apply — show the dirty hint and dim stale results.
