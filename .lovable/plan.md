

# Add Division Column to Employee Performance Summary Report

## Overview
Add the missing "Division" column to the Employee Performance Summary report, both in the data table and Excel export, to match the requested report format.

## Current Gap
The report fetches `departments (name)` from profiles but does not traverse the relationship chain `departments -> business_units -> divisions` to get the division name.

## Changes

### File: `src/pages/reports/EmployeePerformanceSummary.tsx`

1. **Update the `EmployeePerformance` interface** (line 51-65): Add a `division: string` field.

2. **Update the profiles query** (lines 136-145): Expand the select to include division through the relationship chain:
   ```
   departments (name, business_units (name, divisions (name)))
   ```

3. **Update the data mapping** (line 189-204): Extract division name from the nested relationship:
   ```
   division: profile.departments?.business_units?.divisions?.name || '-'
   ```

4. **Update the search filter** (lines 316-328): Add `row.division` to the searchable fields.

5. **Update the table header** (lines 618-631): Add a `<TableHead>Division</TableHead>` column after "Full Name".

6. **Update the table body** (lines 648-684): Add a `<TableCell>{row.division}</TableCell>` after the Full Name cell.

7. **Update the empty-state colSpan** (line 636): Change from 11 to 12.

8. **Update the Excel export** (lines 440-458): Add `'Division': row.division` after 'Full Name'.

9. **Update the Excel column widths** (lines 465-468): Add an entry for the Division column width.

## Technical Notes
- The relationship chain `profiles -> departments -> business_units -> divisions` is already established in the database schema (departments has `department_id` FK on business_units, business_units has FK on divisions).
- No database changes or new RLS policies are needed -- the existing SELECT policies on all these tables allow authenticated users to read them.
- No impact on other reports or features.
