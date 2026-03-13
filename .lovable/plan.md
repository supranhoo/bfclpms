

# Scoring Health Check — Detect Binary KPIs That Should Be Inverted

## Problem

Currently, if a binary KPI like "LTI" or "Any fatality reported" is left at the default polarity (Yes=5, No=0) when it **should** be inverted (No=5, Yes=0), the Health Check does not flag it. The system only checks structural issues (missing labels, invalid ratings). It has no way to identify polarity mismatches based on what the KPI actually measures.

## Solution

Add a new diagnostic: **`BINARY_LIKELY_INVERTED`** — a keyword-based heuristic that scans the KPI name (and optionally description) for safety/negative-outcome keywords. If a match is found and the KPI is using the default Yes=5/No=0 polarity, flag it as a potential misconfiguration.

### Keyword Dictionary

A curated list of terms where "No" is the desired outcome (i.e., should score highest):

```
LTI, lost time, fatality, accident, incident, injury, deviation, 
non-compliance, noncompliance, violation, complaint, rejection, 
spillage, contamination, breakdown, failure, downtime, penalty, 
fire, hazard, unsafe, near miss, nearmiss, pilferage, theft, 
shortage, wastage, attrition, absenteeism, stoppage
```

### Detection Logic (in `detectIssues`)

```text
For binary KPIs:
  1. Get effective options (stored or default Yes=5/No=0)
  2. Check if polarity is standard (Yes=5) — i.e., NOT inverted
  3. If standard polarity:
     - Scan kpi.kpi_name (lowercase) against keyword list
     - If any keyword matches → flag BINARY_LIKELY_INVERTED (medium severity)
```

This is a **non-blocking advisory** — not auto-fixed. The admin reviews and either:
- Clicks "Edit" to open KPI editor and toggle the Binary Polarity
- Dismisses if the standard polarity is intentional

### New Issue Type

| Type | Severity | Description |
|------|----------|-------------|
| `BINARY_LIKELY_INVERTED` | Medium | Binary KPI name suggests "No" should score highest (safety/negative metric), but polarity is standard (Yes=5). |

Suggested fix text: *"This KPI name suggests it measures a negative outcome. Consider toggling Binary Polarity to 'Inverted' (No=5) in the KPI editor."*

No auto-fix — this is heuristic-based and needs human confirmation.

## Files Modified

**`src/components/admin/ScoringHealthCheck.tsx`**
- Add `BINARY_LIKELY_INVERTED` to the `IssueType` union
- Import `isBinaryInverted` from `@/lib/qualitativeUom`
- Add keyword list constant
- In the binary branch of `detectIssues`: after existing checks, if KPI has standard polarity (no stored options OR Yes=5), scan name against keywords and flag if matched
- Include the new type in severity tab rendering

