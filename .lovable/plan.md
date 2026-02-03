# Plan: KPI Observations System

## Status: ✅ COMPLETED

---

## Summary

Implemented the KPI Observations System that allows Self, Managers, Auditors, and Management to tag observations to any KPI during the review process.

## What Was Implemented

### Database
- Created `observation_type` enum: `positive`, `concern`, `neutral`
- Created `kpi_observations` table with columns:
  - `id`, `kpi_id`, `created_by`, `observer_role`
  - `observation_type`, `score_impact` (-5 to +5)
  - `title`, `description`, `evidence_url`
  - `is_applied`, `reviewed_by`, `reviewed_at`
- Added RLS policies for secure access
- Added indexes for performance

### New Components
- `src/hooks/useKpiObservations.ts` - CRUD operations and score calculation
- `src/components/review/KpiObservationsSection.tsx` - Main observations display
- `src/components/review/AddObservationDialog.tsx` - Add/edit observation dialog
- `src/components/review/ObservationCard.tsx` - Individual observation display

### Integration
- Integrated `KpiObservationsSection` into `KpiReviewPanel.tsx`
- Observations visible in the unified KPI detail view across all review levels

## Features
- All roles (Self, Manager, Auditor, Management) can add observations
- Score impact ranges from -5 to +5
- Three observation types: Positive, Concern, Neutral
- Observations can be marked as "Applied" or "Pending"
- Management/Admin observations are auto-applied
- Lower-level observations require approval from higher levels
- Full transparency: all observations visible to entire workflow
- Evidence URL support for documentation
- Score summary shows base score + adjustments = final score

## Workflow

| Observation By | Auto-Applied? | Needs Approval From |
|----------------|---------------|---------------------|
| **Self** | No | Manager, Auditor, or Management |
| **Manager** | No | Auditor or Management |
| **Auditor** | No | Management |
| **Management** | Yes | - |
| **Admin** | Yes | - |
