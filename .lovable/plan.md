

# Plan: KPI Observations System - Reviewer Tags That Impact Scores

## Overview

This feature enables **Employees (Self), Managers, Auditors, and Management** to add observations/tags to any KPI during the review month. These observations:
- Are visible across the entire workflow (full transparency)
- Can **positively or negatively impact** the final score
- Include evidence attachments and categorization
- Create an audit trail for accountability

---

## Use Cases

| Scenario | Observer | Impact |
|----------|----------|--------|
| Employee documents exceptional achievement | Self | +1 score adjustment (pending approval) |
| Manager notices exceptional customer feedback | Manager | +1 score adjustment |
| Auditor finds discrepancy in reported data | Auditor | -1 score adjustment |
| Management observes initiative beyond KPI scope | Management | +1 score adjustment |
| Any reviewer notes a compliance issue | Any | -2 score adjustment |

---

## Visual Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  KPI REVIEW PANEL                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  REVIEW JOURNEY                                                      │   │
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐                            │   │
│  │  │ Self  │ │Manager│ │Auditor│ │ Mgmt  │                            │   │
│  │  │  4    │ │   4   │ │   4   │ │   5   │                            │   │
│  │  └───────┘ └───────┘ └───────┘ └───────┘                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  OBSERVATIONS (3)                              [+ Add Observation]   │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │ 📈 POSITIVE | +1 Score Impact                    [Pending]     │  │   │
│  │  │ Self: Alex Johnson • 10 Jan 2026                              │  │   │
│  │  │ "Completed additional certification ahead of schedule"        │  │   │
│  │  │ [View Evidence]                                               │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │ 📈 POSITIVE | +1 Score Impact                    [Applied ✓]   │  │   │
│  │  │ Manager: John Smith • 15 Jan 2026                             │  │   │
│  │  │ "Exceeded targets on customer retention initiative"           │  │   │
│  │  │ [View Evidence]                                               │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │ ⚠️  CONCERN | -1 Score Impact                    [Applied ✓]   │  │   │
│  │  │ Auditor: Jane Doe • 18 Jan 2026                               │  │   │
│  │  │ "Data discrepancy found in Q4 reporting"                       │  │   │
│  │  │ [View Evidence]                                               │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SCORE SUMMARY                                                       │
│  │  Base Score: 4  |  Adjustments: +1 -1 = 0  |  Final Score: 4        │
│  │  (1 pending observation awaiting approval)                           │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Table: `kpi_observations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `kpi_id` | uuid | FK to kpis table |
| `created_by` | uuid | FK to profiles (observer) |
| `observer_role` | text | Role at time of observation (self/manager/auditor/management/admin) |
| `observation_type` | enum | 'positive', 'concern', 'neutral' |
| `score_impact` | integer | Score adjustment (-5 to +5, default 0) |
| `title` | text | Short observation title |
| `description` | text | Detailed observation notes |
| `evidence_url` | text | Optional supporting evidence |
| `is_applied` | boolean | Whether impact is applied to final score |
| `reviewed_by` | uuid | Who approved/rejected the impact (nullable) |
| `reviewed_at` | timestamp | When impact was reviewed (nullable) |
| `created_at` | timestamp | When observation was created |
| `updated_at` | timestamp | Last modification time |

### New Enum: `observation_type`

```sql
CREATE TYPE observation_type AS ENUM ('positive', 'concern', 'neutral');
```

### RLS Policies

- All authenticated users can read observations for KPIs they can access
- **Self (Employee)** can create observations for their own KPIs
- Managers, Auditors, Management, Admins can create observations
- Only the creator or admin can update/delete their observations

---

## Implementation Components

### 1. New Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useKpiObservations.ts` | CRUD operations for observations |
| `src/components/review/KpiObservationsSection.tsx` | Display observations in review panel |
| `src/components/review/AddObservationDialog.tsx` | Dialog to add new observation |
| `src/components/review/ObservationCard.tsx` | Individual observation display |

### 2. Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/KpiReviewPanel.tsx` | Add observations section below journey |
| `src/components/review/KpiJourneySection.tsx` | Show observation count badge |
| `src/lib/ratingCalculation.ts` | Add function to apply observation adjustments |
| `DOCUMENTATION.md` | Document new feature |

---

## Technical Implementation

### Phase 1: Database Migration

```sql
-- Create observation_type enum
CREATE TYPE observation_type AS ENUM ('positive', 'concern', 'neutral');

-- Create kpi_observations table
CREATE TABLE kpi_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id),
  observer_role text NOT NULL CHECK (observer_role IN ('self', 'manager', 'auditor', 'management', 'admin')),
  observation_type observation_type NOT NULL DEFAULT 'neutral',
  score_impact integer NOT NULL DEFAULT 0 CHECK (score_impact >= -5 AND score_impact <= 5),
  title text NOT NULL,
  description text,
  evidence_url text,
  is_applied boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE kpi_observations ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view observations for KPIs they can access
CREATE POLICY "Users can view observations for accessible KPIs"
  ON kpi_observations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kpis 
      WHERE kpis.id = kpi_observations.kpi_id
      AND (
        kpis.employee_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = kpis.employee_id AND reporting_manager_id = auth.uid()) OR
        has_role(auth.uid(), 'admin') OR
        has_role(auth.uid(), 'auditor') OR
        has_role(auth.uid(), 'management')
      )
    )
  );

-- RLS: Self can create observations for their own KPIs
CREATE POLICY "Employees can create observations for own KPIs"
  ON kpi_observations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM kpis WHERE kpis.id = kpi_id AND kpis.employee_id = auth.uid()
    ) OR
    has_role(auth.uid(), 'manager') OR
    has_role(auth.uid(), 'auditor') OR
    has_role(auth.uid(), 'management') OR
    has_role(auth.uid(), 'admin')
  );

-- Create indexes for performance
CREATE INDEX idx_kpi_observations_kpi_id ON kpi_observations(kpi_id);
CREATE INDEX idx_kpi_observations_created_by ON kpi_observations(created_by);
```

### Phase 2: Hook Implementation

```typescript
// src/hooks/useKpiObservations.ts

export interface KpiObservation {
  id: string;
  kpi_id: string;
  created_by: string;
  observer_role: 'self' | 'manager' | 'auditor' | 'management' | 'admin';
  observation_type: 'positive' | 'concern' | 'neutral';
  score_impact: number;
  title: string;
  description: string | null;
  evidence_url: string | null;
  is_applied: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  created_by_profile?: { full_name: string | null; email: string };
  reviewed_by_profile?: { full_name: string | null; email: string } | null;
}

// Queries
export function useKpiObservations(kpiId: string | undefined) { ... }
export function useObservationsByKpis(kpiIds: string[]) { ... }

// Mutations
export function useCreateObservation() { ... }
export function useUpdateObservation() { ... }
export function useDeleteObservation() { ... }
export function useApplyObservationImpact() { ... }
```

### Phase 3: UI Components

**KpiObservationsSection.tsx:**
- Lists all observations for a KPI
- "Add Observation" button (for all eligible roles including Self)
- Score impact summary (total positive, negative, net, pending)
- Expandable cards with full details
- Shows pending count for observations awaiting approval

**AddObservationDialog.tsx:**
- Type selector (Positive/Concern/Neutral)
- Score impact slider (-5 to +5)
- Title and description fields
- Evidence upload
- Validation: title required, impact must match type

**ObservationCard.tsx:**
- Visual indicator (green for positive, red for concern, gray for neutral)
- Observer info with role badge (Self, Manager, Auditor, Management)
- Status badge (Pending / Applied)
- Timestamp
- Truncated description with expand
- Evidence link
- Edit/Delete for creator
- "Apply Impact" toggle for Management/Admin

### Phase 4: Integration with Score Calculation

```typescript
// In ratingCalculation.ts

export function calculateFinalScoreWithObservations(
  baseScore: number,
  observations: KpiObservation[]
): { 
  finalScore: number; 
  adjustmentTotal: number; 
  appliedObservations: KpiObservation[];
  pendingCount: number;
} {
  const appliedObservations = observations.filter(o => o.is_applied);
  const pendingObservations = observations.filter(o => !o.is_applied);
  const adjustmentTotal = appliedObservations.reduce((sum, o) => sum + o.score_impact, 0);
  
  // Clamp final score between 0 and 5
  const finalScore = Math.max(0, Math.min(5, baseScore + adjustmentTotal));
  
  return { 
    finalScore, 
    adjustmentTotal, 
    appliedObservations,
    pendingCount: pendingObservations.length
  };
}
```

---

## Workflow Integration

### Who Can Add Observations?

| Role | Can Add For | When |
|------|-------------|------|
| **Self (Employee)** | Own KPIs only | Anytime before `approved` |
| **Manager** | Subordinates' KPIs | KPI is in `self_review` or later |
| **Auditor** | Any accessible KPI | KPI is in `manager_check` or later |
| **Management** | Any accessible KPI | KPI is in `audit` or later |
| **Admin** | Any KPI | Anytime |

### Approval Workflow

| Observation By | Auto-Applied? | Needs Approval From |
|----------------|---------------|---------------------|
| **Self** | No | Manager, Auditor, or Management |
| **Manager** | No | Auditor or Management |
| **Auditor** | No | Management |
| **Management** | Yes | - |
| **Admin** | Yes | - |

### When Are Impacts Applied?

- **Self/Manager/Auditor** observations are created with `is_applied = false` (pending)
- **Management/Admin** observations are created with `is_applied = true` (auto-applied)
- Higher-level reviewers can toggle `is_applied` for lower-level observations
- Applied impacts are calculated into the final score
- Once KPI is `approved`, observations become read-only

### Visibility

All observations (including pending) are visible to:
- The employee (owner of the KPI)
- All reviewers in the chain
- Admins

This ensures full transparency in the performance evaluation process.

---

## Files Summary

| Action | File |
|--------|------|
| **Database Migration** | Create `kpi_observations` table with RLS |
| **Create** | `src/hooks/useKpiObservations.ts` |
| **Create** | `src/components/review/KpiObservationsSection.tsx` |
| **Create** | `src/components/review/AddObservationDialog.tsx` |
| **Create** | `src/components/review/ObservationCard.tsx` |
| **Modify** | `src/components/review/KpiReviewPanel.tsx` |
| **Modify** | `src/components/review/KpiJourneySection.tsx` |
| **Modify** | `src/lib/ratingCalculation.ts` |
| **Modify** | `DOCUMENTATION.md` |

---

## Testing Checklist

- [ ] Employee can add observation to their own KPI
- [ ] Employee observations show as "Pending" status
- [ ] Manager can add observation to subordinate's KPI
- [ ] Manager can approve/apply employee observations
- [ ] Auditor can add observation to any KPI in audit stage
- [ ] Auditor can approve/apply manager observations
- [ ] Management can add observation and it's auto-applied
- [ ] Management can approve/apply any pending observation
- [ ] Observations display in KPI Review Panel for all viewers
- [ ] Score impact correctly calculated when applied
- [ ] Pending count displayed in score summary
- [ ] Evidence upload works correctly
- [ ] Creator can edit/delete their observation
- [ ] Non-creator cannot edit/delete
- [ ] Observations are read-only after KPI is approved
- [ ] Observation count shows in Review Journey section

