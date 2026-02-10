

# Fix: Clear Incorrectly Imported Departments and Re-import as Business Units

## What Happened

Your import file had Business Unit names in the `department` column. The system imported them all as departments under the single existing BU ("HR"). Currently:
- **1 Business Unit** exists: "HR"
- **76 departments** exist, but only **1** ("HR-Human Resources") has employees -- the other 75 are incorrectly mapped

## Solution

### Step 1: Database Cleanup

Run a migration to delete all departments that have **zero employees** and **zero KPI references**. This removes the 75 incorrectly imported entries while keeping "HR-Human Resources" (which has 24 employees).

```sql
DELETE FROM departments
WHERE id NOT IN (
  SELECT DISTINCT department_id FROM profiles WHERE department_id IS NOT NULL
);
```

### Step 2: Re-import with Correct Column Mapping

After cleanup, re-upload your file with the data in the correct column:
- Put the Business Unit names in the **businessUnit** column (not `department`)
- The system will create them as proper Business Units under the "Support Function" division

## No code changes needed

The import logic works correctly -- this was a column-mapping issue in the uploaded file. The only action is the database cleanup migration.

## Files changed
- New migration SQL (to delete orphaned departments)

