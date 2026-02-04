
# Comprehensive Admin Controls Configuration System

## Executive Summary

This plan adds a new **"Controls"** tab to System Settings that allows administrators to configure operational parameters currently hardcoded throughout the codebase. This eliminates the need for code changes when adjusting business rules.

---

## Controls to Implement

### Priority 1: Submission Windows

| Control | Current Value | Configurable Range | Location |
|---------|---------------|-------------------|----------|
| Daily Submission Window | 2 days (today + yesterday) | 1-7 days | `frequencyUtils.ts:106-135` |
| Resubmission Grace Period | 0 hours | 0-72 hours | `MyKpis.tsx` (resubmit logic) |
| Working Days per Month | Not tracked | 20-26 days | Used in missed days penalty |

### Priority 2: SLA Thresholds

| Control | Current Value | Configurable Range | Location |
|---------|---------------|-------------------|----------|
| Query Response SLA | 10 days (critical) | 1-30 days | `useSystemIssues.ts:44` |
| Stalled KPI Warning | 14 days | 7-60 days | `useSystemIssues.ts:47` |
| Stalled KPI Critical | 30 days | 14-90 days | `useSystemIssues.ts:47` |
| Pending KRA Warning | 7 days | 3-30 days | `useSystemIssues.ts:49` |
| Pending KRA Critical | 14 days | 7-60 days | `useSystemIssues.ts:49` |

### Priority 3: Validation Rules

| Control | Current Value | Configurable Range | Location |
|---------|---------------|-------------------|----------|
| N/A Reason Min Characters | 50 chars | 10-200 chars | `MyKpis.tsx` (validation) |
| Mandatory Evidence Toggle | Per-KPI setting | Global default | KPI creation |
| Password Min Length | 6 chars | 6-16 chars | Auth logic |

### Priority 4: Observation Settings

| Control | Current Value | Configurable Range | Location |
|---------|---------------|-------------------|----------|
| Max Score Impact | ±5 | ±1 to ±5 | DB constraint |
| Self Observation Auto-Apply | false | true/false | Observation creation |

---

## Database Schema

### New Table: `workflow_settings`

```sql
CREATE TABLE workflow_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,           -- 'submission', 'sla', 'validation', 'observation'
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  unit TEXT,                        -- 'days', 'hours', 'characters'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default values
INSERT INTO workflow_settings (category, setting_key, setting_value, label, description, min_value, max_value, unit) VALUES
-- Submission Windows
('submission', 'daily_submission_window_days', '2', 'Daily Submission Window', 'Number of past days employees can submit daily KPI entries', 1, 7, 'days'),
('submission', 'resubmission_grace_hours', '0', 'Resubmission Grace Period', 'Hours after initial submission when resubmission is allowed without penalty', 0, 72, 'hours'),
('submission', 'working_days_per_month', '22', 'Working Days per Month', 'Standard working days used for missed days penalty calculation', 18, 26, 'days'),

-- SLA Thresholds
('sla', 'query_sla_warning_days', '5', 'Query Warning Threshold', 'Days before query is flagged as high priority', 1, 14, 'days'),
('sla', 'query_sla_critical_days', '10', 'Query Critical Threshold', 'Days before query is marked critical/overdue', 3, 30, 'days'),
('sla', 'stalled_kpi_warning_days', '14', 'Stalled KPI Warning', 'Days at same status before KPI is flagged', 7, 30, 'days'),
('sla', 'stalled_kpi_critical_days', '30', 'Stalled KPI Critical', 'Days at same status before KPI is marked critical', 14, 60, 'days'),
('sla', 'pending_kra_warning_days', '7', 'Pending KRA Warning', 'Days after assignment before warning flag', 3, 14, 'days'),
('sla', 'pending_kra_critical_days', '14', 'Pending KRA Critical', 'Days after assignment before critical flag', 7, 30, 'days'),

-- Validation Rules
('validation', 'na_reason_min_chars', '50', 'N/A Reason Minimum Length', 'Minimum characters required when marking a KPI as N/A', 10, 200, 'characters'),
('validation', 'require_evidence_default', 'false', 'Require Evidence by Default', 'Default value for mandatory evidence when creating KPIs', NULL, NULL, NULL),
('validation', 'password_min_length', '6', 'Password Minimum Length', 'Minimum characters required for user passwords', 6, 16, 'characters'),

-- Observation Settings  
('observation', 'max_observation_impact', '5', 'Max Observation Score Impact', 'Maximum points an observation can add or deduct', 1, 5, 'points'),
('observation', 'self_observation_auto_apply', 'false', 'Auto-Apply Self Observations', 'Automatically apply score impact from employee self-observations', NULL, NULL, NULL);
```

---

## Technical Implementation

### 1. New Hook: `useWorkflowSettings.ts`

```typescript
export interface WorkflowSetting {
  id: string;
  category: 'submission' | 'sla' | 'validation' | 'observation';
  setting_key: string;
  setting_value: string | number | boolean;
  label: string;
  description: string | null;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
}

export function useWorkflowSettings(category?: string) {
  // Fetch all settings or by category
}

export function useWorkflowSetting(key: string) {
  // Fetch single setting with fallback default
}

export function useUpdateWorkflowSetting() {
  // Mutation to update setting value
}

// Convenience hooks for specific settings
export function useDailySubmissionWindow() {
  const { data } = useWorkflowSetting('daily_submission_window_days');
  return data?.setting_value ?? 2; // Default: 2 days
}

export function useSlaThresholds() {
  // Returns all SLA thresholds as typed object
}
```

### 2. New UI Component: `WorkflowSettingsTab.tsx`

```typescript
// Groups settings by category with appropriate input types
// - Number inputs with min/max validation for numeric settings
// - Toggle switches for boolean settings
// - Sliders for range values
// - Inline save buttons per setting
```

### 3. Update Existing Files

| File | Changes |
|------|---------|
| `frequencyUtils.ts` | Import `useDailySubmissionWindow()`, replace hardcoded `1` in `subDays` |
| `useSystemIssues.ts` | Import `useSlaThresholds()`, replace hardcoded `AGE_THRESHOLDS` |
| `MyKpis.tsx` | Import `useWorkflowSetting('na_reason_min_chars')`, use dynamic value |
| `SystemSettings.tsx` | Add "Controls" tab with `WorkflowSettingsTab` component |

---

## UI Design

### Controls Tab Layout

```text
┌─────────────────────────────────────────────────────────────────┐
│  System Settings                                                │
├─────────────────────────────────────────────────────────────────┤
│  [Branding] [General] [Scoring] [Controls] [Email] [Templates]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Submission Windows ──────────────────────────────────────┐  │
│  │                                                           │  │
│  │  Daily Submission Window            [─────●───────] 2 days│  │
│  │  Days employees can backfill daily entries                │  │
│  │                                                           │  │
│  │  Resubmission Grace Period          [●─────────────] 0 hrs│  │
│  │  Hours after initial submission for penalty-free update   │  │
│  │                                                           │  │
│  │  Working Days per Month             [ 22 ] days           │  │
│  │  Used for missed days penalty calculation                 │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ SLA Thresholds ──────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  Query Response                     Warning: 5d  Crit: 10d│  │
│  │  [────●──────────] [────────●──────]                      │  │
│  │                                                           │  │
│  │  Stalled KPI Alert                  Warning: 14d Crit: 30d│  │
│  │  [────────●──────] [────────────●──]                      │  │
│  │                                                           │  │
│  │  Pending KRA Acceptance             Warning: 7d  Crit: 14d│  │
│  │  [──●────────────] [────●──────────]                      │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Validation Rules ────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  N/A Reason Min Length              [ 50 ] characters     │  │
│  │  Minimum explanation required for N/A responses           │  │
│  │                                                           │  │
│  │  Require Evidence by Default        [ OFF ]               │  │
│  │  New KPIs will require evidence upload                    │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Observation Settings ────────────────────────────────────┐  │
│  │                                                           │  │
│  │  Max Score Impact                   [─────────●──] ±5 pts │  │
│  │  Maximum points per observation                           │  │
│  │                                                           │  │
│  │  Auto-Apply Self Observations       [ OFF ]               │  │
│  │  Employee observations affect score immediately           │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                           [ Save All Changes ]                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useWorkflowSettings.ts` | Hook for fetching/updating workflow settings |
| `src/components/admin/WorkflowSettingsTab.tsx` | UI component for Controls tab |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/SystemSettings.tsx` | Add "Controls" tab |
| `src/lib/frequencyUtils.ts` | Use configurable daily window |
| `src/hooks/useSystemIssues.ts` | Use configurable SLA thresholds |
| `src/pages/MyKpis.tsx` | Use configurable N/A character limit |
| `DOCUMENTATION.md` | Document new admin controls |

---

## Implementation Order

1. **Phase 1 - Foundation**
   - Create `workflow_settings` table with seed data
   - Create `useWorkflowSettings.ts` hook
   - Create `WorkflowSettingsTab.tsx` component
   - Add Controls tab to SystemSettings

2. **Phase 2 - Integration**
   - Update `frequencyUtils.ts` for daily window
   - Update `useSystemIssues.ts` for SLA thresholds
   - Update `MyKpis.tsx` for N/A validation

3. **Phase 3 - Documentation**
   - Update DOCUMENTATION.md
   - Add inline help text in UI

---

## Benefits

| Benefit | Impact |
|---------|--------|
| **Flexibility** | Admins can adjust rules without developer involvement |
| **Audit Trail** | `updated_at` tracks when settings changed |
| **Validation** | Min/max constraints prevent invalid configurations |
| **Organization-Specific** | Different orgs can have different business rules |
| **Quick Response** | Urgent policy changes can be applied immediately |
