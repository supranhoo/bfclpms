

# Clear All Employee Data (Keep Admin Only)

## What Will Be Done

Remove all 97 non-admin users from both the profiles table and the authentication system, keeping only the admin account (Ankit Choudhary).

## Step-by-step

### Step 1: Clean up referencing data
Delete the 3 remaining `training_needs` rows and clear any `reporting_manager_id` references to prevent foreign key issues.

### Step 2: Delete non-admin user_roles
Remove role assignments for all users except the admin.

### Step 3: Delete non-admin profiles
Remove all 97 profile records (managers + employees).

### Step 4: Delete non-admin auth users
Use a backend function to remove all 97 users from the authentication system so they no longer exist at all.

## SQL Summary

```sql
-- Clean references
DELETE FROM training_needs;
UPDATE profiles SET reporting_manager_id = NULL WHERE reporting_manager_id IS NOT NULL;

-- Remove roles (keep admin)
DELETE FROM user_roles WHERE user_id != '535d9a14-e4aa-4676-af92-f535373ffc8d';

-- Remove profiles (keep admin)
DELETE FROM profiles WHERE id != '535d9a14-e4aa-4676-af92-f535373ffc8d';
```

Auth user deletion (97 users) will be done via a temporary backend function using the admin API, since auth users cannot be deleted via SQL.

## Result
- **1 user remains**: Ankit Choudhary (admin)
- Database ready for fresh Employee Master upload
