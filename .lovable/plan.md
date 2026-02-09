

# Enhanced KPI Observations System

## Overview

Upgrade the Observation system with 3 changes: replace URL field with file upload, remove score impact, and add reply threads with resolution status. Keep Queries as the separate formal escalation channel.

## What Changes

### 1. Replace Evidence URL with File Upload

Replace the text URL input in AddObservationDialog with the existing `MultiFileUpload` component (already used throughout the app for up to 5 files).

- **Remove**: The `<Input type="url">` field and `Link` icon
- **Add**: The `MultiFileUpload` component pointing to the `review-evidence` storage bucket
- **DB**: Already has `evidence_urls` (JSONB) column -- just start using it instead of `evidence_url`

### 2. Remove Score Impact

Remove the score impact slider from the Add/Edit dialog, the score impact badge from ObservationCard, and the score summary section from KpiObservationsSection.

- **Remove from dialog**: The `Slider` for score_impact (-5 to +5) and its labels
- **Remove from card**: The "+X Score" badge display
- **Remove from section**: The "Score Impact: Base → Final" summary footer
- **DB**: Set `score_impact` default to 0, keep column for backward compatibility
- **Code**: Remove `calculateScoreWithObservations` usage and the import

### 3. Add Reply Thread and Resolution Status

This is the biggest change. Add a `kpi_observation_replies` table and new status flow.

#### New Database Table: `kpi_observation_replies`

```text
id              UUID (PK)
observation_id  UUID (FK -> kpi_observations)
reply_by        UUID (FK -> profiles)
reply_text      TEXT (not null)
evidence_urls   JSONB (nullable, multi-file)
created_at      TIMESTAMPTZ
```

#### New Column on `kpi_observations`

```text
status  TEXT  DEFAULT 'open'   -- values: 'open', 'acknowledged', 'resolved'
```

#### Status Flow

- **open**: Default when observation is created (replaces current `is_applied` = false)
- **acknowledged**: The KPI owner or recipient has seen and replied to it
- **resolved**: The observation raiser marks it as resolved (no negative impact counted)

#### Who Can Do What

- **Raiser** (person who created observation): Can mark as "resolved"
- **KPI Owner** (employee whose KPI it is): Can reply to observations
- **Any reviewer in chain**: Can reply to observations
- **Resolution**: Only the raiser can close/resolve -- this ensures accountability

#### UI Changes

**ObservationCard** -- expanded with:
- Status badge: Open (yellow) / Acknowledged (blue) / Resolved (green)
- Inline reply thread (expandable, like a mini chat)
- "Reply" button for the KPI owner and reviewers
- "Mark Resolved" button (only visible to the observation raiser)

**AddObservationDialog** -- simplified:
- Remove score impact slider
- Replace URL input with MultiFileUpload
- Keep: observation type (positive/concern/neutral), title, description

**KpiObservationsSection** -- updated summary:
- Remove score impact summary
- Add status counts: "2 Open, 1 Resolved"

### 4. Notification Integration

Add notification inserts when:
- A reply is posted on an observation (notify the raiser)
- An observation is resolved (notify the KPI owner)

No email templates needed initially -- these will use in-app notifications only.

## Files to Change

| File | Change |
|------|--------|
| **New migration SQL** | Add `kpi_observation_replies` table with RLS, add `status` column to `kpi_observations`, set `score_impact` default to 0 |
| `src/hooks/useKpiObservations.ts` | Add `status` field to types, remove `calculateScoreWithObservations`, add `useObservationReplies` and `useCreateObservationReply` hooks, add `useResolveObservation` mutation |
| `src/components/review/AddObservationDialog.tsx` | Remove score impact slider, replace URL input with MultiFileUpload |
| `src/components/review/ObservationCard.tsx` | Add status badge, inline reply thread, Reply button, Mark Resolved button |
| `src/components/review/KpiObservationsSection.tsx` | Remove score summary, update status counts |
| `DOCUMENTATION.md` | Update observation system documentation |

## Why Keep Queries Separate

- **Queries** = formal escalation with inbox visibility, email notifications, and a strict open/responded/resolved workflow between two specific people
- **Observations** = lightweight feedback with optional discussion, visible on the KPI review panel, accessible to all reviewers in the chain

The key difference: queries demand a response and appear in the inbox. Observations are opt-in discussions that live on the KPI itself.

## Technical Notes

- The `score_impact` column is kept in the database (set to 0 by default) for backward compatibility with existing data
- The `is_applied` column remains but becomes driven by the new `status` field (resolved = not applied as negative)
- RLS on `kpi_observation_replies`: authenticated users can SELECT all replies for observations they can see; INSERT only for users in the review chain of the KPI
- The reply thread UI will use a simple expandable section within ObservationCard, not a separate dialog

