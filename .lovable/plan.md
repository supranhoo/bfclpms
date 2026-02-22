

# Add `{{observation_description}}` to Email Template Editor

## Summary

Add the `observation_description` placeholder to two places in `EmailTemplateEditor.tsx`:
1. The PLACEHOLDERS reference list (so admins see it as an available placeholder)
2. The default `observation_raised` email body template

## Changes

### File: `src/components/admin/EmailTemplateEditor.tsx`

**Change 1 -- PLACEHOLDERS array (after line 423)**

Add a new entry after the `observation_type` placeholder:

```
{ key: '{{observation_description}}', description: 'Observation description (observation events only)' },
```

**Change 2 -- observation_raised default body (line 330)**

Insert `Description: {{observation_description}}` after the `Type:` line:

```
KPI: {{kpi_name}}
Observation: {{observation_title}}
Type: {{observation_type}}
Description: {{observation_description}}
```

### File: `DOCUMENTATION.md`

Version bump to 1.45.66.

## Technical Details

| File | Lines | Change |
|------|-------|--------|
| `src/components/admin/EmailTemplateEditor.tsx` | ~423 | Add `observation_description` to PLACEHOLDERS array |
| `src/components/admin/EmailTemplateEditor.tsx` | ~330 | Add `Description: {{observation_description}}` to default template body |
| `DOCUMENTATION.md` | version line | Bump to 1.45.66 |

No backend or database changes needed -- the edge function already supports this placeholder from the previous fix.

