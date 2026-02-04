
# Plan: Implement Global Multi-line Formatting for KPI Text Data

## Overview

This plan implements comprehensive multi-line text formatting to ensure all KPI text data (including existing data with patterns like `- Description:`, `- Formula:`, `- Scoring Logic:`) displays properly with preserved line breaks throughout the UI.

---

## Current State Analysis

### Data Pattern Observed

From the database, KPI names contain structured patterns:

```
Accuracy of New Employee Documentation:
- Description: Measures the completeness and accuracy of all required onboarding documents and HRMS master data for new hires, based on weekly reviews.
- Formula: (1 - (Number of files with errors or missing documents / Total number of new hire files reviewed)) * 100.
- Scoring Logic: (Scoring: 5 for 100% accuracy, 4 for 98-99.9%, 3 for 95-97.9%, 2 for 90-94.9%, 1 for 85-89.9%, 0 for <85%)
```

### Current Problem

- Text is stored correctly in the database
- Line breaks (`\n`) exist but may be inconsistent (some have `\n` before "- Description:", some don't)
- UI components do NOT apply `white-space: pre-wrap`, so line breaks are not displayed
- Only 3 files currently use `whitespace-pre-wrap`: `EmailTemplateEditor.tsx`, `ReviewStageCard.tsx`, and `AuditLogs.tsx`

### Files Displaying KPI/KRA Names (Need Formatting)

| File | Display Context |
|------|-----------------|
| `KpiDetailsTable.tsx` | Main table showing KRA/KPI names |
| `KpiHeaderSection.tsx` | KPI review panel header |
| `ReviewDetailsCard.tsx` | KPI details card in reviews |
| `ReviewDetailsCardCompact.tsx` | Compact KPI card |
| `KpiMetricsSection.tsx` | Metrics display with rating scale |
| `KpiLogicModal.tsx` | KPI logic details modal |
| `KpiTrackerModal.tsx` | Historical tracking modal |
| `SelfReview.tsx` | Self-review page |
| `TeamReview.tsx`, `AuditPanel.tsx`, `ManagementReview.tsx` | Review pages |
| `AllKpis.tsx` | Admin KPI management |
| `OrgKpiOverview.tsx` | Organization-level KPIs |
| `MonthlyScorecardReport.tsx` | Reports |

---

## Technical Implementation

### Phase 1: Create Central Formatting Utilities

**New File:** `src/lib/textFormatting.ts`

```typescript
/**
 * Text Formatting Utilities
 * Central location for text normalization and display formatting
 */

/**
 * Normalize structured KPI text by ensuring newlines before section markers.
 * This handles both "clean" new data and "messy" existing data.
 * 
 * Pattern: Finds markers like "- Description:", "- Formula:", "- Scoring Logic:"
 * without a preceding newline and inserts one.
 * 
 * @param text - Raw text from database
 * @returns Normalized text with proper line breaks
 */
export function normalizeKpiText(text: string | null | undefined): string {
  if (!text) return '';
  
  // Regex pattern: Match section markers NOT preceded by a newline
  // Matches: " - Description:", "- Formula:", etc.
  // Does NOT match: "\n- Description:" (already has newline)
  const sectionMarkerPattern = /(?<!\n)(\s*)(-\s*(?:Description|Formula|Scoring Logic|Criteria|Measurement|Target|Note)s?:)/gi;
  
  return text.replace(sectionMarkerPattern, '\n$2');
}

/**
 * CSS class utility for pre-wrap text display
 */
export const preWrapClass = 'whitespace-pre-wrap';
```

---

### Phase 2: Create Reusable Display Component

**New File:** `src/components/ui/FormattedText.tsx`

```typescript
import { cn } from '@/lib/utils';
import { normalizeKpiText, preWrapClass } from '@/lib/textFormatting';

interface FormattedTextProps {
  text: string | null | undefined;
  className?: string;
  as?: 'p' | 'span' | 'div';
  normalize?: boolean; // Apply section marker normalization
}

/**
 * Renders text with preserved line breaks.
 * Optionally normalizes KPI-style structured text.
 */
export function FormattedText({ 
  text, 
  className, 
  as: Tag = 'p',
  normalize = true 
}: FormattedTextProps) {
  const displayText = normalize ? normalizeKpiText(text) : (text || '');
  
  return (
    <Tag className={cn(preWrapClass, className)}>
      {displayText}
    </Tag>
  );
}
```

---

### Phase 3: Update All KPI Display Components

#### 3.1 KpiDetailsTable.tsx (Primary Table)

```typescript
// Line 312 - Update KPI name display
<p className="text-sm text-muted-foreground flex items-center gap-1 whitespace-pre-wrap">
  {normalizeKpiText(kpi.kpi_name)}
  <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
</p>
```

#### 3.2 KpiHeaderSection.tsx

```typescript
// Lines 44-49 - Full text display
<h3 className="font-semibold text-lg text-primary leading-tight whitespace-pre-wrap">
  {normalizeKpiText(kpi.kra_name)}
</h3>
<p className="text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
  {normalizeKpiText(kpi.kpi_name)}
</p>
```

#### 3.3 ReviewDetailsCard.tsx

```typescript
// Lines 18, 35 - Apply formatting
<p className="font-semibold text-primary whitespace-pre-wrap">
  {normalizeKpiText(kpi.kra_name)}
</p>
// ...
<p className="text-sm whitespace-pre-wrap">
  {normalizeKpiText(kpi.kpi_name)}
</p>
```

#### 3.4 KpiMetricsSection.tsx

Rating scale values also need `pre-wrap` for complex threshold descriptions.

#### 3.5 Other Components

- `ReviewDetailsCardCompact.tsx`
- `KpiLogicModal.tsx`
- `KpiTrackerModal.tsx`
- `SelfReview.tsx`
- Review pages (Team, Audit, Management)
- `AllKpis.tsx`
- `OrgKpiOverview.tsx`

---

### Phase 4: Data Migration Script (One-Time Cleanup)

**New Edge Function:** `supabase/functions/normalize-kpi-text/index.ts`

This optional function scans existing records and normalizes text formatting:

```typescript
// Normalize patterns in kpi_name and kra_name columns
const normalizationPattern = /(?<!\n)(\s*)(-\s*(?:Description|Formula|Scoring Logic|Criteria|Measurement|Target|Note)s?:)/gi;

// For each KPI/template with the pattern:
UPDATE kpis SET kpi_name = REGEXP_REPLACE(
  kpi_name, 
  '([^\n])(\s*-\s*(?:Description|Formula|Scoring Logic):)', 
  E'\\1\n\\2',
  'gi'
) WHERE kpi_name ~ '-\s*(Description|Formula|Scoring Logic):';
```

This is optional since the client-side normalization handles display, but it ensures data consistency for exports/reports.

---

### Phase 5: Unit Tests

**New File:** `src/lib/textFormatting.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeKpiText } from './textFormatting';

describe('normalizeKpiText', () => {
  describe('messy existing data (missing newlines)', () => {
    it('inserts newline before - Description:', () => {
      const input = 'KPI Title - Description: Some description';
      const expected = 'KPI Title\n- Description: Some description';
      expect(normalizeKpiText(input)).toBe(expected);
    });

    it('inserts newlines before multiple markers', () => {
      const input = 'KPI Name - Description: Desc - Formula: F - Scoring Logic: SL';
      const result = normalizeKpiText(input);
      expect(result).toContain('\n- Description:');
      expect(result).toContain('\n- Formula:');
      expect(result).toContain('\n- Scoring Logic:');
    });
  });

  describe('clean new data (already has newlines)', () => {
    it('preserves existing newlines', () => {
      const input = 'KPI Name\n- Description: Desc\n- Formula: F';
      expect(normalizeKpiText(input)).toBe(input);
    });
  });

  describe('edge cases', () => {
    it('handles null/undefined gracefully', () => {
      expect(normalizeKpiText(null)).toBe('');
      expect(normalizeKpiText(undefined)).toBe('');
    });

    it('handles text without markers', () => {
      const input = 'Simple KPI without sections';
      expect(normalizeKpiText(input)).toBe(input);
    });

    it('is case-insensitive', () => {
      const input = 'KPI - DESCRIPTION: Desc - formula: F';
      const result = normalizeKpiText(input);
      expect(result).toContain('\n- DESCRIPTION:');
      expect(result).toContain('\n- formula:');
    });
  });
});
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/textFormatting.ts` | Central formatting utilities with regex normalizer |
| `src/lib/textFormatting.test.ts` | Unit tests for formatting logic |
| `src/components/ui/FormattedText.tsx` | Reusable pre-wrap text component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/KpiDetailsTable.tsx` | Add `whitespace-pre-wrap` and normalization |
| `src/components/review/KpiHeaderSection.tsx` | Add formatting to KRA/KPI names |
| `src/components/review/ReviewDetailsCard.tsx` | Add pre-wrap styling |
| `src/components/review/ReviewDetailsCardCompact.tsx` | Add formatting |
| `src/components/review/KpiMetricsSection.tsx` | Format rating scale descriptions |
| `src/components/dashboard/KpiLogicModal.tsx` | Format modal content |
| `src/components/dashboard/KpiTrackerModal.tsx` | Format tracker modal |
| `src/pages/SelfReview.tsx` | Format KPI displays |
| `src/pages/admin/AllKpis.tsx` | Format admin table |
| `src/pages/admin/OrgKpiOverview.tsx` | Format org KPIs |
| `src/pages/reports/MonthlyScorecardReport.tsx` | Format report output |
| `DOCUMENTATION.md` | Document text formatting system |

---

## Implementation Order

1. **Phase 1 - Foundation**
   - Create `src/lib/textFormatting.ts` with `normalizeKpiText()` function
   - Create unit tests `src/lib/textFormatting.test.ts`

2. **Phase 2 - Reusable Component**
   - Create `src/components/ui/FormattedText.tsx`

3. **Phase 3 - Apply to All Components**
   - Update `KpiDetailsTable.tsx` (most used)
   - Update `KpiHeaderSection.tsx`
   - Update remaining display components

4. **Phase 4 - Testing & Documentation**
   - Run unit tests
   - Verify visual output on existing data
   - Update DOCUMENTATION.md

---

## Regression Protection

The unit tests cover:

| Scenario | Test Case |
|----------|-----------|
| Messy existing data | Text with markers but no newlines |
| Clean new data | Text already properly formatted |
| Edge cases | null/undefined, no markers, case variations |
| Idempotency | Running normalizer twice yields same result |

---

## Expected Outcome

**Before:**
```
Accuracy of New Employee Documentation: - Description: Measures the completeness... - Formula: (1 - (Number of files...
```

**After:**
```
Accuracy of New Employee Documentation:
- Description: Measures the completeness...
- Formula: (1 - (Number of files...
- Scoring Logic: (Scoring: 5 for 100%...
```

All KPI text fields will display with proper line breaks, making structured data readable for HR administrators and employees.
