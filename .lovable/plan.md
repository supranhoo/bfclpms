

# Add "Level" to Organization Structure

## Overview
Add a new "Level" classification to the Organization Structure, following the exact same pattern as Designation and PMS Grade. Level will have its own master lookup table and will be mapped to each employee as a text field on their profile.

## Changes

### 1. Database Migration
- Create a new `levels` table with columns: `id`, `name`, `code`, `description`, `created_at` (same structure as `designations` and `pms_grades`)
- Add a `level` text column to the `profiles` table (nullable, just like `designation` and `pms_grade`)
- Add RLS policies matching existing tables

### 2. Hook: `src/hooks/useOrganization.ts`
- Add a `useLevels()` query hook fetching from the `levels` table, following the same pattern as `useDesignations()` and `usePmsGrades()`

### 3. Organization Page: `src/pages/admin/Organization.tsx`
- Add a new "Levels" tab alongside PMS Grades
- Wire up create, delete, and inline code-edit for levels (same pattern as PMS Grades)
- Update the dialog type union to include `'level'`
- Update the create/delete/update mutations to handle the `levels` table

### 4. Organization Structure Import: `src/components/admin/OrgStructureImport.tsx`
- Add `level` and `levelCode` columns to the import template and parsing logic
- Add level creation/update logic in the import handler (same as pmsGrade handling)
- Add Level columns to the preview table and export

### 5. Employee Import: `src/pages/admin/ImportData.tsx`
- Add `level` to the employee import row interface
- Parse `level` column from the uploaded Excel file
- Pass `level` to the `create-employee` edge function and profile updates
- Add Level column to the employee preview table and export

### 6. Edge Function: `supabase/functions/create-employee/index.ts`
- Accept `level` in the request body
- Store `level` on the profile during creation and updates

### 7. Documentation: `DOCUMENTATION.md`
- Update to reflect the new Level field across organization structure, employee profiles, and imports

## Technical Details
- `levels` table schema mirrors `pms_grades`: `id uuid PK`, `name text NOT NULL`, `code text`, `description text`, `created_at timestamptz`
- `profiles.level` is a nullable text field (no FK, same as `designation` and `pms_grade`)
- The Level field is purely a classification label -- no hierarchy relationship
