
# Plan: Enhance Query Response Dialog with Attachments and Raiser Name

## Problem Analysis

From the screenshot provided, I can see the "Respond to Query" dialog has two issues:

1. **Missing Raiser Name**: The "Raised By" field shows the label but the actual name is not displaying (currently line 610 should be showing `raised_by_profile.full_name` but it appears empty)

2. **No Attachment Support**: The dialog lacks the ability to:
   - View attachments uploaded by the query raiser
   - Upload new attachments when responding to a query
   - Track/store response attachments in the database

## Root Cause Analysis

### Issue 1: Missing Raiser Name
Looking at line 609-610 in QueryInbox.tsx:
```tsx
<Label className="text-xs text-muted-foreground">Raised By</Label>
<p className="text-sm">{selectedQuery?.raised_by_profile?.full_name || selectedQuery?.raised_by_profile?.email}</p>
```

The code looks correct - the profile data should be populated via the profile lookup on lines 94-104. Need to verify the profiles query is working correctly.

### Issue 2: No Attachment Support
The `kpi_queries` table already has an `evidence_url` column (used when raising a query), but:
- No column exists for **response attachments**
- The dialog doesn't show existing query attachments
- The dialog has no file upload component for responses

## Solution Overview

| Area | Enhancement |
|------|-------------|
| Database | Add `resolution_evidence_url` column to `kpi_queries` table |
| Query Dialog | Display raiser's name prominently (fix visibility) |
| Query Dialog | Show original query attachment if exists |
| Query Dialog | Add file upload for response attachment |
| Mutation | Update `resolveQuery` to save response attachment URL |

## Files to Modify

| File | Changes |
|------|---------|
| New migration | Add `resolution_evidence_url` column |
| `src/pages/QueryInbox.tsx` | Enhance dialog with attachment support and fix name display |
| `DOCUMENTATION.md` | Document query attachment feature |

## Technical Implementation

### 1. Database Migration

```sql
-- Add column for response/resolution attachment
ALTER TABLE public.kpi_queries
ADD COLUMN resolution_evidence_url TEXT NULL;

-- Comment for clarity
COMMENT ON COLUMN public.kpi_queries.resolution_evidence_url IS 
  'File URL for attachment included when resolving the query';
```

### 2. QueryInbox.tsx Changes

**2a. Fix Raiser Name Display (ensure visibility)**

The current code is:
```tsx
<div>
  <Label className="text-xs text-muted-foreground">Raised By</Label>
  <p className="text-sm">{selectedQuery?.raised_by_profile?.full_name || selectedQuery?.raised_by_profile?.email}</p>
</div>
```

This should work but may need defensive handling. Will ensure the name is visible with better styling and fallback.

**2b. Add State for Response Attachment**

```tsx
const [responseEvidenceUrl, setResponseEvidenceUrl] = useState('');
```

**2c. Update Dialog UI Structure**

```text
+----------------------------------------+
| Respond to Query                        |
| Provide your response and resolution    |
+----------------------------------------+
| [Query Details Box]                     |
|   KPI: Monthly Freq                     |
|   Query: [SENT BACK] hiiii              |
|   Raised By: John Doe (highlighted)     |
|   [View Attachment] (if exists)         |
+----------------------------------------+
| Your Response *                         |
| [________________________]              |
| [________________________]              |
|                                         |
| Attach Evidence (Optional)              |
| [Upload Evidence File]                  |
+----------------------------------------+
| [Cancel]           [Resolve Query]      |
+----------------------------------------+
```

**2d. Import and Use EvidenceUpload Component**

The existing `EvidenceUpload` component can be reused but needs slight adaptation for the query context (different storage path).

**2e. Update resolveQuery Mutation**

```tsx
const resolveQuery = useMutation({
  mutationFn: async ({ 
    query_id, 
    resolution_notes,
    resolution_evidence_url,  // NEW
  }: { 
    query_id: string; 
    resolution_notes: string;
    resolution_evidence_url?: string;  // NEW
  }) => {
    const { error } = await supabase
      .from('kpi_queries')
      .update({
        status: 'resolved' as const,
        resolution_notes,
        resolution_evidence_url,  // NEW
        resolved_at: new Date().toISOString(),
      })
      .eq('id', query_id);
    // ...
  },
});
```

### 3. Query Card Updates

When viewing resolved queries in the Sent tab, show the response attachment if present:

```tsx
{query.resolution_evidence_url && (
  <a href={query.resolution_evidence_url} target="_blank" className="...">
    <Paperclip className="h-4 w-4" />
    View Response Attachment
  </a>
)}
```

Similarly, show original query attachment in query cards:

```tsx
{query.evidence_url && (
  <a href={query.evidence_url} target="_blank" className="...">
    <Paperclip className="h-4 w-4" />
    View Query Attachment
  </a>
)}
```

### 4. EvidenceUpload Enhancement

Create a variant of EvidenceUpload or pass different props for query context:
- Storage path: `query-evidence/{userId}/{queryId}/{timestamp}.{ext}`
- Or reuse existing `review-evidence` bucket with different path structure

## Visual Flow

```text
Query Lifecycle with Attachments:

1. Manager raises query
   ├── Reason text
   └── Optional: evidence_url (existing field)

2. Employee opens "Respond to Query" dialog
   ├── Sees query details
   ├── Sees raiser name: "Raised By: John Smith"
   ├── Sees attachment link: [View Attachment] (if exists)
   ├── Enters response text
   ├── Optional: uploads response attachment
   └── Clicks "Resolve Query"

3. Query resolved
   ├── resolution_notes saved
   └── resolution_evidence_url saved (if uploaded)

4. Manager views resolved query (Sent tab)
   ├── Sees resolution_notes
   └── Sees response attachment link (if exists)
```

## Testing Checklist

- Verify raiser name displays correctly in the dialog
- Raise a query with an attachment from EmployeeScorecard
- Open the query response dialog and verify the attachment is viewable
- Upload a response attachment and resolve the query
- Verify the attachment is saved and visible in resolved query card
- Test with queries that have no attachments (graceful handling)
