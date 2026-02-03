
# Comprehensive Plan: Unified KPI Review Panel with History

## Overview

This plan combines two previously discussed features into a single, cohesive implementation:

1. **Unified KPI Review Panel** - Full-width, structured layout with all KPI information visible without scrolling
2. **KPI History Card** - Show historical performance across previous months directly in the review sheet

The goal is to create a reusable component system that works consistently across all review levels (Employee, Manager, Auditor, Management).

---

## Current Problems

| Issue | Impact |
|-------|--------|
| Information is scattered across multiple small cards | Requires scrolling to see all data |
| Sheet panels don't use full available width | Cramped layout, poor readability |
| No historical context during reviews | Reviewers can't see performance trends |
| Inconsistent layouts across review levels | Confusing user experience |
| Query history and journey not visible together | Missing complete picture |

---

## Solution Architecture

### New Component Hierarchy

```text
KpiReviewPanel (Main Container - Full Width)
├── KpiHeaderSection
│   ├── Category Badge, Status Badge, Period Badge
│   └── KRA Name, KPI Name (full text, no truncation)
│
├── Two-Column Layout
│   ├── LEFT COLUMN (40%)
│   │   ├── KpiMetricsSection
│   │   │   ├── Target, Criteria, Weightage
│   │   │   ├── Frequency, Source
│   │   │   └── Inline Rating Scale (R1-R5)
│   │   │
│   │   └── KpiHistoryCard (NEW)
│   │       ├── Sparkline Trend Chart
│   │       ├── Last 6 Months Table (compact)
│   │       └── "View Full History" button → KpiTrackerModal
│   │
│   └── RIGHT COLUMN (60%)
│       └── KpiJourneySection
│           ├── 4-Column Review Trail Grid
│           │   ├── Self (Blue)
│           │   ├── Manager (Amber)
│           │   ├── Auditor (Purple)
│           │   └── Management (Emerald)
│           │
│           └── Query Summary Row
│               └── Open/Resolved counts + View History button
│
├── DailySubmissionSummary (if Daily KPI - Full Width)
│
└── Assessment Form (for current reviewer - Full Width)
```

---

## Visual Layout

```text
+-----------------------------------------------------------------------------------+
| SHEET HEADER (Management Review / Audit Review / etc.)                            |
+-----------------------------------------------------------------------------------+
|                                                                                     |
| ┌─────────────────────────────────────────────────────────────────────────────────┐ |
| │ KPI HEADER                                                                       │ |
| │ [Category Badge]     [Status: management_review]  [Jan-2026]  [Weight: 15%]      │ |
| │ KRA: Operational Excellence                                                      │ |
| │ KPI: Achieve 95% customer satisfaction rating                                   │ |
| └─────────────────────────────────────────────────────────────────────────────────┘ |
|                                                                                     |
| ┌───────────────────────────┐  ┌─────────────────────────────────────────────────┐ |
| │ METRICS & SCALE           │  │ REVIEW JOURNEY                                   │ |
| │ ┌───────────────────────┐ │  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│ |
| │ │ Target: 95%           │ │  │ │  SELF    │ │ MANAGER  │ │ AUDITOR  │ │ MGMT   ││ |
| │ │ Criteria: Higher Bettr│ │  │ │ Score: 4 │ │ Score: 4 │ │ Score: 4 │ │ (now)  ││ |
| │ │ Weightage: 15%        │ │  │ │ Exceeds  │ │ Exceeds  │ │ Exceeds  │ │        ││ |
| │ │ Frequency: Monthly    │ │  │ │ [Link]   │ │ [Link]   │ │ [Link]   │ │        ││ |
| │ │ Source: Survey Data   │ │  │ │ "Good.." │ │ "Agree.."│ │ "Valid.."│ │        ││ |
| │ └───────────────────────┘ │  │ └──────────┘ └──────────┘ └──────────┘ └────────┘│ |
| │                           │  │                                                   │ |
| │ RATING SCALE              │  │ Query Summary: 0 open, 2 resolved [View History] │ |
| │ R5: >=110%  R4: >=100%    │  └─────────────────────────────────────────────────┘ |
| │ R3: >=90%   R2: >=80%     │                                                       |
| │ R1: >=70%                 │                                                       |
| │                           │                                                       |
| │ ┌───────────────────────┐ │                                                       |
| │ │ KPI HISTORY           │ │                                                       |
| │ │ Trend: [__/‾\__/‾]    │ │                                                       |
| │ │ Dec-25: 4 ✓ Approved  │ │                                                       |
| │ │ Nov-25: 4 ✓ Approved  │ │                                                       |
| │ │ Oct-25: 3 ✓ Approved  │ │                                                       |
| │ │     [View Full History]│ │                                                       |
| │ └───────────────────────┘ │                                                       |
| └───────────────────────────┘                                                       |
|                                                                                     |
| ┌─────────────────────────────────────────────────────────────────────────────────┐ |
| │ MANAGEMENT ASSESSMENT (editable for current reviewer)                           │ |
| │ [Score Input]   [Remarks Textarea]   [Evidence Upload]                          │ |
| └─────────────────────────────────────────────────────────────────────────────────┘ |
|                                                                                     |
+-----------------------------------------------------------------------------------+
| [ ↩ Send Back ]  ─────────────────────  [ Cancel ] [ Save Draft ] [ ✓ Approve ]   |
+-----------------------------------------------------------------------------------+
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/review/KpiReviewPanel.tsx` | Main unified panel container |
| `src/components/review/KpiHeaderSection.tsx` | Header with badges and names |
| `src/components/review/KpiMetricsSection.tsx` | Metrics grid and rating scale |
| `src/components/review/KpiJourneySection.tsx` | Review trail grid + query summary |
| `src/components/review/ReviewStageCard.tsx` | Individual stage card (Self/Manager/etc) |
| `src/components/review/KpiHistoryCard.tsx` | Historical performance card |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/ManagementScorecard.tsx` | Replace Sheet content with KpiReviewPanel, expand width |
| `src/components/review/AuditScorecard.tsx` | Replace Sheet content with KpiReviewPanel, expand width |
| `src/components/review/EmployeeScorecard.tsx` | Replace Sheet content with KpiReviewPanel |
| `src/pages/MyKpis.tsx` | Use KpiReviewPanel for view mode |
| `DOCUMENTATION.md` | Document new component architecture |

---

## Technical Specifications

### 1. KpiReviewPanel.tsx (Main Container)

```typescript
interface KpiReviewPanelProps {
  kpi: KPI;
  submission: ReviewSubmission | null;
  allKpis: KPI[];  // For history lookup
  allSubmissions: ReviewSubmission[];  // For history lookup
  queries?: KpiQuery[];
  
  // View context
  viewLevel: 'employee' | 'manager' | 'auditor' | 'management';
  isReadOnly?: boolean;
  
  // Daily KPI support
  subPeriodSubmissions?: SubPeriodSubmission[];
  selectedPeriod: string;
  selectedYear: number;
  
  // Callbacks
  onOpenQueryHistory?: () => void;
  onOpenFullHistory?: () => void;
}
```

### 2. KpiHeaderSection.tsx

Displays:
- Category badge with dynamic color from database
- Status badge with workflow state
- Period badge (e.g., "Jan-2026")
- Weightage badge
- Full KRA name (no truncation)
- Full KPI name (no truncation)

### 3. KpiMetricsSection.tsx

Displays in a compact grid:
- Target value with UOM
- Criteria (Higher/Lower is Better)
- Weightage percentage
- Frequency (if not Monthly)
- Source of data (if available)
- Inline Rating Scale (R1-R5) with tooltips

### 4. KpiJourneySection.tsx

Features:
- 4-column responsive grid (Self | Manager | Auditor | Management)
- Each column uses `ReviewStageCard` component
- Visual indicators: completed (solid), current (ring highlight), pending (muted)
- Query summary row with open/resolved counts
- "View History" button for query details

### 5. ReviewStageCard.tsx

```typescript
interface ReviewStageCardProps {
  icon: LucideIcon;
  iconColor: 'blue' | 'amber' | 'purple' | 'emerald';
  title: string;
  score: number | null;
  rating: RatingLevel | null;
  remarks: string | null;
  evidenceUrl: string | null;
  status: 'completed' | 'current' | 'pending';
}
```

Displays:
- Icon with color-coded background
- Stage title
- Score badge with rating label
- Remarks (truncated with tooltip for full text)
- Evidence link (if available)
- Visual status (completed/current/pending)

### 6. KpiHistoryCard.tsx

Features:
- Mini sparkline chart showing score trends (using Recharts)
- Compact table showing last 6 months
- Each row: Month | Achieved | Score | Status
- Trend indicator (up/down/neutral arrow)
- "View Full History" button opens KpiTrackerModal

```typescript
interface KpiHistoryCardProps {
  kpi: KPI;
  allKpis: KPI[];
  submissions: ReviewSubmission[];
  maxMonths?: number;  // Default: 6
  onViewFullHistory?: () => void;
}
```

---

## Sheet Width Changes

Update all scorecards to use wider sheets:

```tsx
<SheetContent 
  className="flex flex-col h-full w-[85vw] max-w-[1200px] sm:max-w-[1200px] overflow-y-auto"
>
```

This ensures:
- 85% viewport width on desktop
- Maximum 1200px to prevent extreme stretching
- Proper scrolling when content exceeds viewport height

---

## Component Reusability Matrix

| Component | MyKPIs | TeamReview | Audit | Management |
|-----------|--------|------------|-------|------------|
| KpiReviewPanel | ✓ (read-only) | ✓ | ✓ | ✓ |
| KpiHeaderSection | ✓ | ✓ | ✓ | ✓ |
| KpiMetricsSection | ✓ | ✓ | ✓ | ✓ |
| KpiJourneySection | ✓ | ✓ | ✓ | ✓ |
| ReviewStageCard | ✓ | ✓ | ✓ | ✓ |
| KpiHistoryCard | ✓ | ✓ | ✓ | ✓ |
| KpiTrackerModal | ✓ | ✓ | ✓ | ✓ |

---

## View Level Configurations

| View Level | Journey Stages Visible | Assessment Form | Actions |
|------------|------------------------|-----------------|---------|
| Employee (My KPIs) | Self only (if submitted) | Self input (if editable) | Submit |
| Manager (Team Review) | Self | Manager input | Approve, Send Back |
| Auditor | Self + Manager | Auditor input | Forward, Send Back |
| Management | Self + Manager + Auditor | Management input | Approve, Send Back |

---

## Deprecation Plan

After integration, these components will be deprecated:
- `ReviewTrailCard.tsx` → Replaced by `KpiJourneySection`
- `PreviousLevelRemarks.tsx` → Replaced by `KpiJourneySection`
- `ReviewDetailsCard.tsx` → Replaced by `KpiHeaderSection` + `KpiMetricsSection`

Keep `ReviewTrailCardCompact` for table inline use if needed.

---

## Testing Checklist

### All Review Levels
- [ ] KPI names display fully without truncation
- [ ] Category badge shows correct color
- [ ] Status badge shows correct workflow state
- [ ] Metrics section displays target, criteria, weightage
- [ ] Rating scale is visible with tooltips
- [ ] Review journey shows all completed stages
- [ ] Current stage is highlighted
- [ ] Pending stages are muted
- [ ] Evidence links open in new tab
- [ ] Remarks show tooltip on hover

### KPI History Card
- [ ] Sparkline chart renders correctly
- [ ] Shows last 6 months of data
- [ ] Trend arrow shows correct direction
- [ ] "View Full History" opens KpiTrackerModal
- [ ] Hidden when no historical data exists

### Query Summary
- [ ] Shows open query count
- [ ] Shows resolved query count
- [ ] "View History" opens query modal

### Sheet Layout
- [ ] Sheet uses expanded width (85vw)
- [ ] All information visible without horizontal scroll
- [ ] Vertical scroll only when content exceeds height
- [ ] Works on tablet and desktop
- [ ] Assessment form positioned correctly
- [ ] Footer buttons remain accessible

### Daily KPIs
- [ ] Daily Submission Summary displays correctly
- [ ] Override editor works when reviewer disagrees
- [ ] Stats cards show correctly

---

## Implementation Order

### Phase 1: Create Atomic Components (Parallel)
1. `ReviewStageCard.tsx` - Single stage display
2. `KpiHeaderSection.tsx` - Header with badges
3. `KpiMetricsSection.tsx` - Metrics + rating scale
4. `KpiHistoryCard.tsx` - History with sparkline

### Phase 2: Create Container Components
5. `KpiJourneySection.tsx` - Compose ReviewStageCards + query summary
6. `KpiReviewPanel.tsx` - Main container composing all sections

### Phase 3: Integration
7. Update `ManagementScorecard.tsx` - Replace sheet content
8. Update `AuditScorecard.tsx` - Replace sheet content
9. Update `EmployeeScorecard.tsx` - Replace sheet content
10. Update `MyKpis.tsx` - Use for view mode

### Phase 4: Cleanup & Documentation
11. Update `DOCUMENTATION.md`
12. Deprecate old components (mark with comments)
13. Write unit tests for new components

