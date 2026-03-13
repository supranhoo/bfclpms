

# Fix: Binary KPI Handling in Scoring Health Check

## Problem

The Health Check treats binary KPIs the same as tiered KPIs, flagging them as `MISSING_QUALITATIVE_OPTIONS` when `qualitative_options` is null. But binary KPIs have a **built-in fallback** (`BINARY_OPTIONS`: Yes=5 / No=0) — they score correctly without stored options. This produces false positives.

Additionally, the Health Check has no awareness of binary-specific issues like inverted polarity mismatches.

## Changes

**`src/components/admin/ScoringHealthCheck.tsx`** — Update the `detectIssues` function's binary/tiered branch:

### 1. Stop false-flagging binary KPIs with no options
Binary KPIs without `qualitative_options` use the default `BINARY_OPTIONS` fallback — they work fine. Only flag `MISSING_QUALITATIVE_OPTIONS` for **tiered** KPIs.

### 2. Add new issue type: `BINARY_POLARITY_MISMATCH`
Detect binary KPIs where the stored `qualitative_options` have unexpected ratings (neither standard Yes=5/No=0 nor inverted Yes=0/No=5). This catches corrupted or misconfigured binary options.

### 3. Add new issue type: `BINARY_MISSING_POLARITY`
For binary KPIs that DO have `qualitative_options` but are missing either the "Yes" or "No" label — incomplete configuration.

### Updated Detection Logic

```text
For binary KPIs:
  - If qualitative_options exist:
    - Check that both "Yes" and "No" labels are present → if not: BINARY_MISSING_POLARITY (high)
    - Check ratings are valid (each is 0 or 5) → if not: BINARY_INVALID_RATINGS (medium)
  - If qualitative_options are null/empty:
    - Do NOT flag (default fallback handles scoring)

For tiered KPIs:
  - If qualitative_options are null/empty → MISSING_QUALITATIVE_OPTIONS (high) [existing]
  - If options exist but have < 2 entries → MISSING_QUALITATIVE_OPTIONS (high)
```

### New Issue Types Added

| Type | Severity | Description |
|------|----------|-------------|
| `BINARY_MISSING_POLARITY` | High | Binary KPI has options but missing "Yes" or "No" label |
| `BINARY_INVALID_RATINGS` | Medium | Binary KPI option ratings are not standard (0 or 5) |

### Fix Actions
- **BINARY_MISSING_POLARITY**: No auto-fix — open KPI editor (existing Edit button)
- **BINARY_INVALID_RATINGS**: No auto-fix — open KPI editor. These need human judgment on intended polarity.

## Files Modified
- `src/components/admin/ScoringHealthCheck.tsx` — Update detection logic, add new issue types, update severity tab rendering

