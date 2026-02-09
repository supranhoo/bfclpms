

# Fix Remaining Public READ Policies

## Summary
4 tables have SELECT policies that say "Authenticated users can view..." but are actually granted to the `public` role, meaning unauthenticated users can read them. Fix by restricting to `authenticated` role only.

The `profiles` table finding is a false positive -- all its SELECT policies are already correctly scoped to `authenticated`.

## Changes (single SQL migration)

### Tables to fix

| Table | Current Policy Name | Current Role | New Role |
|-------|-------------------|--------------|----------|
| `frequency_config` | Authenticated users can view frequency_config | public | authenticated |
| `review_periods` | Authenticated users can view review_periods | public | authenticated |
| `workflow_config` | Authenticated users can view workflow_config | public | authenticated |
| `workflow_templates` | Authenticated users can view workflow_templates | public | authenticated |

### SQL

```sql
-- frequency_config
DROP POLICY IF EXISTS "Authenticated users can view frequency_config" ON frequency_config;
CREATE POLICY "Authenticated users can view frequency_config"
  ON frequency_config FOR SELECT
  TO authenticated
  USING (true);

-- review_periods
DROP POLICY IF EXISTS "Authenticated users can view review_periods" ON review_periods;
CREATE POLICY "Authenticated users can view review_periods"
  ON review_periods FOR SELECT
  TO authenticated
  USING (true);

-- workflow_config
DROP POLICY IF EXISTS "Authenticated users can view workflow_config" ON workflow_config;
CREATE POLICY "Authenticated users can view workflow_config"
  ON workflow_config FOR SELECT
  TO authenticated
  USING (true);

-- workflow_templates
DROP POLICY IF EXISTS "Authenticated users can view workflow_templates" ON workflow_templates;
CREATE POLICY "Authenticated users can view workflow_templates"
  ON workflow_templates FOR SELECT
  TO authenticated
  USING (true);
```

### Clear false positive
Delete the `profiles` security finding since all its SELECT policies are already correctly scoped to `authenticated`.

### Update DOCUMENTATION.md
Add a note that all reference/config tables require authentication for read access.

## Risk Assessment
- **Zero risk**: The frontend already requires login before accessing any page that reads these tables
- No data will be affected, only access control tightened

## Files Modified
- New SQL migration
- `DOCUMENTATION.md` updated
