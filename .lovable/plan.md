
# Multi-File Evidence Upload - Implementation Plan

## Overview

Enable uploading multiple supporting documents/evidence files across all upload locations in the application. Currently, only single file uploads are supported.

---

## Current State Analysis

### Existing Upload Components

| Component | Location | Usage |
|-----------|----------|-------|
| `EvidenceUpload.tsx` | Self Review, Team Review, Audit, Management | KPI evidence at each level |
| `OrgKpiFileUpload.tsx` | Org KPI Data Entry | Supporting files for org-level KPIs |

### Current Database Schema

Evidence is stored as single URL strings in these columns:
- `review_submissions.self_evidence_url` (string)
- `review_submissions.manager_evidence_url` (string)
- `review_submissions.auditor_evidence_url` (string)
- `review_submissions.management_evidence_url` (string)
- `org_kpi_values.evidence_url` (string)
- `kpi_observations.evidence_url` (string)
- `kpi_queries.evidence_url` (string)
- `kpi_queries.resolution_evidence_url` (string)

---

## Proposed Solution

### Phase 1: Database Schema Migration

Add new JSONB array columns to store multiple URLs (keeping existing columns for backward compatibility):

```sql
-- review_submissions - multi-file support
ALTER TABLE review_submissions 
ADD COLUMN self_evidence_urls JSONB DEFAULT '[]',
ADD COLUMN manager_evidence_urls JSONB DEFAULT '[]',
ADD COLUMN auditor_evidence_urls JSONB DEFAULT '[]',
ADD COLUMN management_evidence_urls JSONB DEFAULT '[]';

-- Migrate existing single URLs to arrays
UPDATE review_submissions 
SET self_evidence_urls = CASE WHEN self_evidence_url IS NOT NULL THEN jsonb_build_array(self_evidence_url) ELSE '[]' END,
    manager_evidence_urls = CASE WHEN manager_evidence_url IS NOT NULL THEN jsonb_build_array(manager_evidence_url) ELSE '[]' END,
    auditor_evidence_urls = CASE WHEN auditor_evidence_url IS NOT NULL THEN jsonb_build_array(auditor_evidence_url) ELSE '[]' END,
    management_evidence_urls = CASE WHEN management_evidence_url IS NOT NULL THEN jsonb_build_array(management_evidence_url) ELSE '[]' END;

-- org_kpi_values
ALTER TABLE org_kpi_values ADD COLUMN evidence_urls JSONB DEFAULT '[]';
UPDATE org_kpi_values SET evidence_urls = CASE WHEN evidence_url IS NOT NULL THEN jsonb_build_array(evidence_url) ELSE '[]' END;

-- kpi_queries
ALTER TABLE kpi_queries 
ADD COLUMN evidence_urls JSONB DEFAULT '[]',
ADD COLUMN resolution_evidence_urls JSONB DEFAULT '[]';
```

---

### Phase 2: Multi-File Upload Component

Create new `MultiFileUpload.tsx` component with:

**Features:**
- Upload multiple files at once
- Display file grid/list with thumbnails
- Individual file removal
- Progress indicator per file
- Drag-and-drop support
- Max 5 files limit per evidence field

**Interface:**
```typescript
interface MultiFileUploadProps {
  userId: string;
  contextId: string; // KPI ID, Query ID, etc.
  folder: string; // 'self-evidence', 'manager-evidence', etc.
  existingUrls: string[];
  onUploadComplete: (urls: string[]) => void;
  maxFiles?: number; // Default: 5
  disabled?: boolean;
}
```

**UI Layout:**
```text
┌─────────────────────────────────────────────────────────┐
│ Evidence Attachments (2/5)                              │
├─────────────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────────────────────────────────────┐ │
│ │ PDF │ │ XLS │ │  + Add more files                   │ │
│ │ ──  │ │ ── │ │    Drag & drop or click to upload  │ │
│ │  X  │ │  X  │ │    JPEG, PNG, PDF, Excel (max 10MB)│ │
│ └─────┘ └─────┘ └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

### Phase 3: Update Upload Locations

#### 3a. Self Review (`SelfReview.tsx`)
- Replace `EvidenceUpload` with `MultiFileUpload`
- Update state from `evidenceUrl: string | null` to `evidenceUrls: string[]`
- Update mutation to pass array

#### 3b. Team Review Scorecard (`EmployeeScorecard.tsx`)
- Replace single upload with multi-file
- Update manager evidence state and mutation

#### 3c. Audit Scorecard (`AuditScorecard.tsx`)
- Replace single upload with multi-file
- Update auditor evidence state and mutation

#### 3d. Management Scorecard (`ManagementScorecard.tsx`)
- Replace single upload with multi-file
- Update management evidence state and mutation

#### 3e. Org KPI Data Entry (`OrgKpiDataEntry.tsx`)
- Replace `OrgKpiFileUpload` with `MultiFileUpload`
- Update value change handler

#### 3f. My KPIs Page (`MyKpis.tsx`)
- Replace `EvidenceUpload` with `MultiFileUpload`

---

### Phase 4: Update Data Hooks

#### `useKpis.ts` Updates
```typescript
// Submit review mutation - update signature
submitReview.mutate({
  // ...existing fields
  self_evidence_urls: string[]; // instead of self_evidence_url
});

// Approve mutations
approveKpi.mutate({
  manager_evidence_urls: string[];
});

submitAuditReview.mutate({
  auditor_evidence_urls: string[];
});

submitManagementReview.mutate({
  management_evidence_urls: string[];
});
```

---

### Phase 5: Update Display Components

#### Review Trail Card
Update to display multiple files with file type icons:

```text
Evidence Files:
• report-jan.pdf [View]
• screenshot.png [View]
```

#### Observation Card
Update to handle multiple evidence URLs

#### Inbox Detail Sheet
Update attachment section for arrays

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| SQL Migration | Create | Add JSONB array columns |
| `src/components/ui/MultiFileUpload.tsx` | Create | New multi-file upload component |
| `src/components/ui/EvidenceUpload.tsx` | Deprecate/Keep | Keep for simple single-file cases |
| `src/pages/SelfReview.tsx` | Modify | Use MultiFileUpload |
| `src/pages/MyKpis.tsx` | Modify | Use MultiFileUpload |
| `src/components/review/AuditScorecard.tsx` | Modify | Use MultiFileUpload |
| `src/components/review/ManagementScorecard.tsx` | Modify | Use MultiFileUpload |
| `src/components/review/EmployeeScorecard.tsx` | Modify | Use MultiFileUpload |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Modify | Use MultiFileUpload |
| `src/hooks/useKpis.ts` | Modify | Update mutation signatures |
| `src/components/review/ReviewTrailCard.tsx` | Modify | Display multiple files |
| `DOCUMENTATION.md` | Update | Document multi-file feature |

---

## Technical Considerations

### Backward Compatibility
- Keep existing `*_evidence_url` columns readable
- New uploads write to `*_evidence_urls` arrays
- Display logic checks both columns (array first, then legacy string)

### Storage Organization
Files organized by context:
```
review-evidence/
  └── {userId}/
      └── {kpiId}/
          ├── self/
          │   ├── 1234567890.pdf
          │   └── 1234567891.png
          ├── manager/
          └── auditor/
```

### File Limits
- Max 5 files per evidence field
- Max 10MB per file (unchanged)
- Supported formats: JPEG, PNG, PDF, Excel

---

## Implementation Order

1. **Database Migration** - Add new JSONB columns, migrate existing data
2. **Create MultiFileUpload** - Build the new component
3. **Update Self Review** - Start with employee-facing flow
4. **Update Reviewer Scorecards** - Manager, Audit, Management
5. **Update Org KPI Entry** - Admin data entry
6. **Update Display Components** - Review trails, sheets
7. **Update Hooks** - Mutation signatures
8. **Test & Documentation** - End-to-end testing
