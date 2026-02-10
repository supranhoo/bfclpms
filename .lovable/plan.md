

# Add Observation Email Templates

## Problem

The `EmailTemplateEditor.tsx` has a `DEFAULT_TEMPLATES` array that defines the subject/body for each notification event. The three observation events (`observation_raised`, `observation_reply`, `observation_resolved`) were added to the notification settings but **not** to the templates editor, so admins cannot customize their email content.

## Changes

### 1. `src/components/admin/EmailTemplateEditor.tsx`

Add three new entries to the `DEFAULT_TEMPLATES` array (after `pip_completed`, before the closing `];`):

```typescript
{
  key: 'observation_raised',
  label: 'Observation Raised',
  description: 'Sent to KPI owner when a new observation is raised',
  subject: '[PMS] New Observation on {{kpi_name}}',
  bodyTemplate: `Hi {{recipient_name}},

{{actor_name}} has raised a new observation on your KPI.

KPI: {{kpi_name}}
Observation: {{observation_title}}
Type: {{observation_type}}

Please review and respond to the observation.`,
  color: '#f97316',
  emoji: '👁️',
},
{
  key: 'observation_reply',
  label: 'Observation Reply',
  description: 'Sent when someone replies to an observation',
  subject: '[PMS] New Reply on Observation - {{kpi_name}}',
  bodyTemplate: `Hi {{recipient_name}},

{{actor_name}} has replied to an observation on {{kpi_name}}.

Observation: {{observation_title}}

Please check the observation thread for the latest update.`,
  color: '#8b5cf6',
  emoji: '💬',
},
{
  key: 'observation_resolved',
  label: 'Observation Resolved',
  description: 'Sent when an observation is marked as resolved',
  subject: '[PMS] Observation Resolved - {{kpi_name}}',
  bodyTemplate: `Hi {{recipient_name}},

An observation on your KPI has been resolved.

KPI: {{kpi_name}}
Observation: {{observation_title}}

The observation has been closed. No further action is required.`,
  color: '#10b981',
  emoji: '✅',
},
```

Also add new placeholder entries to the `PLACEHOLDERS` array:

```typescript
{ key: '{{observation_title}}', description: 'Observation title (observation events only)' },
{ key: '{{observation_type}}', description: 'Observation type (observation raised only)' },
```

### 2. `DOCUMENTATION.md`

Note that observation email templates are customizable from the Templates tab.

## Result

All three observation notification types will appear in the **System Settings > Templates** tab, allowing admins to customize the email subject and body for each observation event.
