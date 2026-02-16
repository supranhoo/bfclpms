# RLS Policy Inventory

> **Generated from live database on 2026-02-16.**
> All 46 public tables have RLS enabled.
> To re-audit, run [`docs/rls-audit.sql`](./rls-audit.sql) against the database.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **ALL** | SELECT + INSERT + UPDATE + DELETE |
| `auth.uid()` | Currently authenticated user's UUID |
| `has_role(uid, role)` | SECURITY DEFINER helper checking `user_roles` |
| `get_skip_level_manager(id)` | Returns manager-of-manager UUID |
| `get_direct_report_ids(uid)` | Returns direct report UUIDs (avoids recursion) |
| `is_data_owner_for_employee(emp, owner)` | Checks org KPI data ownership |

---

## 1. Authentication & Authorization

### `user_roles`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage all roles | ALL | authenticated | `has_role(auth.uid(), 'admin')` |
| Users can view their own roles | SELECT | authenticated | `auth.uid() = user_id` |

### `profiles`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage all profiles | ALL | authenticated | `has_role(auth.uid(), 'admin')` |
| Admins can view all profiles | SELECT | authenticated | `has_role(auth.uid(), 'admin')` |
| Auditors can view all profiles | SELECT | authenticated | `has_role(auth.uid(), 'auditor')` |
| Management can view all profiles | SELECT | authenticated | `has_role(auth.uid(), 'management')` |
| Managers can view their direct reports | SELECT | authenticated | `has_role(auth.uid(), 'manager') AND reporting_manager_id = auth.uid()` |
| Managers can view skip-level reports | SELECT | authenticated | `has_role(auth.uid(), 'manager') AND reporting_manager_id IN (get_direct_report_ids(auth.uid()))` |
| Data owners can view org kpi employee profiles | SELECT | authenticated | `is_data_owner_for_employee(id, auth.uid())` |
| Users can view their own profile | SELECT | authenticated | `auth.uid() = id` |
| Users can update their own profile | UPDATE | authenticated | `auth.uid() = id` |

---

## 2. KPI Workflow (Core)

### `kpis`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage all KPIs | ALL | authenticated | `has_role(auth.uid(), 'admin')` |
| Admins and auditors can view all KPIs | SELECT | authenticated | `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'auditor')` |
| Admins can delete KPIs | DELETE | authenticated | `has_role(auth.uid(), 'admin')` |
| Admin can update KPI status | UPDATE | authenticated | `has_role(auth.uid(), 'admin')` |
| Auditors can update KPI status | UPDATE | authenticated | `has_role(auth.uid(), 'auditor')` |
| HR PMS can view all KPIs | SELECT | public | `has_role(auth.uid(), 'hr_pms')` |
| HR PMS can update KPI status during review | UPDATE | public | `has_role(auth.uid(), 'hr_pms')` |
| Management can view all KPIs | SELECT | public | `has_role(auth.uid(), 'management')` |
| Management can update KPI status during review | UPDATE | authenticated | `has_role(auth.uid(), 'management') AND status = 'management_review'` |
| Managers can view their reports' KPIs | SELECT | authenticated | `has_role(auth.uid(), 'manager') AND employee reporting_manager_id = auth.uid()` |
| Managers can update reports KPI status | UPDATE | authenticated | `has_role(auth.uid(), 'manager') AND employee reporting_manager_id = auth.uid()` |
| Skip-level managers can view reports KPIs | SELECT | public | `get_skip_level_manager(employee) = auth.uid()` |
| Skip-level managers can update reports KPI status | UPDATE | public | `get_skip_level_manager(employee) = auth.uid()` |
| Data owners can view assigned org-level KPIs | SELECT | authenticated | `is_org_level = true AND owner matches in org_kpi_data_owners` |
| Employees can view their own KPIs | SELECT | authenticated | `employee_id = auth.uid()` |
| Users can update their own KPIs | UPDATE | public | `employee_id = auth.uid()` |

### `review_submissions`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage all submissions | ALL | authenticated | `has_role(auth.uid(), 'admin')` |
| Admin can update submissions | UPDATE | authenticated | `has_role(auth.uid(), 'admin')` |
| Admins and auditors can view all submissions | SELECT | authenticated | `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'auditor')` |
| Auditors can update submissions | UPDATE | authenticated | `has_role(auth.uid(), 'auditor')` |
| HR PMS can view all submissions | SELECT | public | `has_role(auth.uid(), 'hr_pms')` |
| HR PMS can update submissions during review | UPDATE | public | `has_role(auth.uid(), 'hr_pms')` |
| Management can view all submissions | SELECT | public | `has_role(auth.uid(), 'management')` |
| Management can update submissions during review | UPDATE | public | `has_role(auth.uid(), 'management') AND kpi.status = 'management_review'` |
| Managers can view their reports' submissions | SELECT | authenticated | `has_role(auth.uid(), 'manager') AND employee reporting_manager_id = auth.uid()` |
| Managers can update their reports' submissions | UPDATE | authenticated | `has_role(auth.uid(), 'manager') AND employee reporting_manager_id = auth.uid()` |
| Skip-level managers can view reports submissions | SELECT | public | `get_skip_level_manager(employee) = auth.uid()` |
| Skip-level managers can update reports submissions | UPDATE | public | `get_skip_level_manager(employee) = auth.uid()` |
| Employees can view their own submissions | SELECT | authenticated | `kpi.employee_id = auth.uid()` |
| Employees can create/update their own submissions | INSERT | authenticated | `kpi.employee_id = auth.uid()` |
| Data owners can insert org-level submissions | INSERT | authenticated | `kpi.is_org_level = true AND owner matches in org_kpi_data_owners` |
| Employees can update self review fields | UPDATE | authenticated | `kpi.employee_id = auth.uid()` |
| Data owners can update org-level submissions | UPDATE | authenticated | `kpi.is_org_level = true AND owner matches in org_kpi_data_owners` |

### `sub_period_submissions`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage all sub-period submissions | ALL | public | `has_role(auth.uid(), 'admin')` |
| Auditors can view all sub-period submissions | SELECT | public | `has_role(auth.uid(), 'auditor')` |
| HR PMS can view all sub-period submissions | SELECT | public | `has_role(auth.uid(), 'hr_pms')` |
| Management can view all sub-period submissions | SELECT | public | `has_role(auth.uid(), 'management')` |
| Managers can view their reports' sub-period submissions | SELECT | public | `has_role(auth.uid(), 'manager') AND employee reporting_manager_id = auth.uid()` |
| Skip-level managers can view reports sub-period submissions | SELECT | public | `get_skip_level_manager(employee) = auth.uid()` |
| Employees can view their own sub-period submissions | SELECT | public | `kpi.employee_id = auth.uid()` |
| Employees can create their own sub-period submissions | INSERT | public | `kpi.employee_id = auth.uid()` |
| Employees can update their own sub-period submissions | UPDATE | public | `kpi.employee_id = auth.uid()` |

### `performance_reviews`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage all reviews | ALL | authenticated | `has_role(auth.uid(), 'admin')` |
| Admins and auditors can view all reviews | SELECT | authenticated | `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'auditor')` |
| Auditors can update reviews | UPDATE | authenticated | `has_role(auth.uid(), 'auditor')` |
| HR PMS can view all reviews | SELECT | public | `has_role(auth.uid(), 'hr_pms')` |
| Management can view all reviews | SELECT | public | `has_role(auth.uid(), 'management')` |
| Management can update reviews | UPDATE | public | `has_role(auth.uid(), 'management')` |
| Managers can view their reports' reviews | SELECT | authenticated | `has_role(auth.uid(), 'manager') AND employee reporting_manager_id = auth.uid()` |
| Managers can update their reports' reviews | UPDATE | authenticated | `has_role(auth.uid(), 'manager') AND employee reporting_manager_id = auth.uid()` |
| Skip-level managers can view reports reviews | SELECT | public | `get_skip_level_manager(employee) = auth.uid()` |
| Employees can view their own reviews | SELECT | authenticated | `employee_id = auth.uid()` |

---

## 3. Observations & Queries

### `kpi_observations`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Users can view observations for accessible KPIs | SELECT | authenticated | Employee owns KPI, or is manager, admin, auditor, or management |
| HR PMS can view all observations | SELECT | public | `has_role(auth.uid(), 'hr_pms')` |
| Skip-level can view observations | SELECT | public | `get_skip_level_manager(employee) = auth.uid()` |
| Users can create observations | INSERT | authenticated | `created_by = auth.uid()` AND (owns KPI or has manager/auditor/management/admin role) |
| Users can update own observations | UPDATE | authenticated | `created_by = auth.uid()` OR admin or management |
| Users can delete own observations | DELETE | authenticated | `created_by = auth.uid()` OR admin |

### `kpi_observation_replies`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view observation replies | SELECT | public | `auth.uid() IS NOT NULL` |
| Authenticated users can create observation replies | INSERT | public | `auth.uid() = reply_by` |
| Users can delete their own replies | DELETE | public | `auth.uid() = reply_by` |

### `kpi_queries`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage all queries | ALL | public | `has_role(auth.uid(), 'admin')` |
| Auditors can view all queries | SELECT | public | `has_role(auth.uid(), 'auditor')` |
| HR PMS can view all queries | SELECT | public | `has_role(auth.uid(), 'hr_pms')` |
| Management can view all queries | SELECT | public | `has_role(auth.uid(), 'management')` |
| Managers can view queries for their reports | SELECT | public | `has_role(auth.uid(), 'manager') AND employee reporting_manager_id = auth.uid()` |
| Skip-level managers can view reports queries | SELECT | public | `get_skip_level_manager(employee) = auth.uid()` |
| Users can view queries they raised or received | SELECT | public | `raised_by = auth.uid() OR raised_to = auth.uid()` |
| Users can create queries | INSERT | public | `raised_by = auth.uid()` |
| Users can update queries they received | UPDATE | public | `raised_to = auth.uid()` |

### `kpi_rollback_requests`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view rollback requests | SELECT | authenticated | `true` |
| Users can create their own rollback requests | INSERT | authenticated | `auth.uid() = requested_by` |
| Reviewers can action rollback requests | UPDATE | authenticated | `auth.uid() <> requested_by` |

---

## 4. Org-Level KPI Management

### `org_kpi_values`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage org_kpi_values | ALL | public | `has_role(auth.uid(), 'admin')` |
| Authenticated users can view org_kpi_values | SELECT | public | `true` (authenticated) |
| Data owners can insert their assigned org_kpi_values | INSERT | authenticated | Admin or matched in `org_kpi_data_owners` |
| Data owners can update their assigned org_kpi_values | UPDATE | authenticated | Admin or matched in `org_kpi_data_owners` |

### `org_kpi_data_owners`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage org_kpi_data_owners | ALL | authenticated | `has_role(auth.uid(), 'admin')` |
| Authenticated users can read org_kpi_data_owners | SELECT | authenticated | `true` |

### `org_kpi_data_entry_logs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins and data owners can view audit logs | SELECT | public | Admin, or `performed_by = auth.uid()`, or matched data owner |
| Authenticated users can insert audit logs | INSERT | public | `auth.uid() = performed_by` |

### `org_kpi_value_history`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can view org kpi value history | SELECT | authenticated | `has_role(auth.uid(), 'admin')` |
| System can insert org kpi value history | INSERT | authenticated | `true` |

---

## 5. PIP (Performance Improvement Plans)

### `performance_improvement_plans`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admin and Management can view all PIPs | SELECT | public | `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'management')` |
| Admin can delete PIPs | DELETE | public | `has_role(auth.uid(), 'admin')` |
| Authorized users can update PIPs | UPDATE | public | Admin, management, or `initiated_by = auth.uid()` |
| Employees can view their own PIPs | SELECT | public | `auth.uid() = employee_id` |
| Managers can create PIPs for team | INSERT | public | Admin, management, or manager with reporting relationship |
| Managers can view PIPs they initiated | SELECT | public | `auth.uid() = initiated_by` |
| Managers can view team PIPs | SELECT | public | Employee reporting_manager_id = auth.uid() |

### `pip_milestones`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admin can delete milestones | DELETE | public | `has_role(auth.uid(), 'admin')` |
| Managers can manage milestones | INSERT | public | PIP initiated_by = auth.uid() or admin/management |
| Managers can update milestones | UPDATE | public | PIP initiated_by = auth.uid() or admin/management |
| Users can view milestones of accessible PIPs | SELECT | public | Employee, initiator, admin, management, or team manager |

### `pip_audit_logs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can insert audit logs | INSERT | authenticated | `has_role(auth.uid(), 'admin')` |
| Users can view audit logs of accessible PIPs | SELECT | public | Employee, initiator, admin, management, or auditor |

---

## 6. Training Needs

### `training_needs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admin and HR can view all training needs | SELECT | public | `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'management')` |
| Admin can delete training needs | DELETE | public | `has_role(auth.uid(), 'admin')` |
| Authorized users can update training needs | UPDATE | public | Admin, management, or team manager |
| Employees can view their own training needs | SELECT | public | `auth.uid() = employee_id` |
| Managers can create training needs for team | INSERT | public | Admin, management, manager, or team manager |
| Managers can view team training needs | SELECT | public | Employee reporting_manager_id = auth.uid() |

---

## 7. Audit & System Logs

### `kpi_audit_logs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can view all audit logs | SELECT | public | `has_role(auth.uid(), 'admin')` |
| Auditors can view all audit logs | SELECT | public | `has_role(auth.uid(), 'auditor')` |
| Management can view audit logs | SELECT | public | `has_role(auth.uid(), 'management')` |
| Managers can view audit logs for their reports | SELECT | public | Manager with reporting relationship via KPI |
| Users can view audit logs for their KPIs | SELECT | public | KPI employee_id = auth.uid() |
| Admin can insert audit logs | INSERT | authenticated | `has_role(auth.uid(), 'admin')` |
| System can insert audit logs | INSERT | public | `performed_by = auth.uid()` |

### `email_logs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can view email logs | SELECT | public | `has_role(auth.uid(), 'admin')` |

### `backup_logs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can view backup logs | SELECT | public | `has_role(auth.uid(), 'admin')` |
| Admins can create backup logs | INSERT | public | `has_role(auth.uid(), 'admin')` |
| Admins can update backup logs | UPDATE | public | `has_role(auth.uid(), 'admin')` |
| Service role can manage backup logs | ALL | public | `auth.role() = 'service_role'` |

### `kra_rollover_logs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can view rollover logs | SELECT | public | `has_role(auth.uid(), 'admin')` |
| Admins can insert rollover logs | INSERT | authenticated | `has_role(auth.uid(), 'admin')` |

### `password_rollout_logs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can view rollout logs | SELECT | authenticated | `has_role(auth.uid(), 'admin')` |
| Admins can insert rollout logs | INSERT | authenticated | `has_role(auth.uid(), 'admin')` |

### `import_progress`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Users can view their own import progress | SELECT | public | `auth.uid() = user_id` |
| Only system can create import progress | INSERT | public | `false` (service role only) |
| Only system can update import progress | UPDATE | public | `false` (service role only) |
| Import history cannot be deleted | DELETE | public | `false` |

### `bundle_assignment_logs`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can view all bundle assignment logs | SELECT | public | `has_role(auth.uid(), 'admin')` |
| Admins can insert bundle assignment logs | INSERT | public | `has_role(auth.uid(), 'admin')` |

---

## 8. Notifications

### `notifications`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Users can view own notifications | SELECT | public | `user_id = auth.uid()` |
| Users can update own notifications | UPDATE | public | `user_id = auth.uid()` |
| Users and admins can insert notifications | INSERT | authenticated | `user_id = auth.uid() OR has_role(auth.uid(), 'admin')` |

---

## 9. Employee Working Days

### `employee_working_days`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Admins can manage all employee working days | ALL | public | `has_role(auth.uid(), 'admin')` |
| Employees can view their own working days | SELECT | public | `auth.uid() = employee_id` |
| Managers can view reportee working days | SELECT | public | Employee reporting_manager_id = auth.uid() |

---

## 10. Reference & Configuration Data

### `app_settings`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Anyone can read app_settings | SELECT | **public (incl. anon)** | `true` |
| Admins can update app_settings | UPDATE | public | `has_role(auth.uid(), 'admin')` |

### `system_settings`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Allow anon to read settings | SELECT | **anon** | `true` |
| Allow authenticated users to read settings | SELECT | authenticated | `true` |
| Allow admins to manage settings | ALL | public | `has_role(auth.uid(), 'admin')` |

### `kra_categories`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view kra_categories | SELECT | authenticated | `true` |
| Admins can manage kra_categories | ALL | authenticated | `has_role(auth.uid(), 'admin')` |

### `kpi_templates`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view kpi_templates | SELECT | public | `true` |
| Admins can manage kpi_templates | ALL | public | `has_role(auth.uid(), 'admin')` |

### `template_bundles`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view active bundles | SELECT | authenticated | `is_active = true` |
| Admins can manage all bundles | ALL | authenticated | `has_role(auth.uid(), 'admin')` |

### `template_bundle_items`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view bundle items | SELECT | authenticated | Parent bundle `is_active = true` |
| Admins can manage all bundle items | ALL | authenticated | `has_role(auth.uid(), 'admin')` |

### `review_periods`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view review_periods | SELECT | authenticated | `true` |
| Admins can manage review_periods | ALL | public | `has_role(auth.uid(), 'admin')` |

### `frequency_config`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view frequency_config | SELECT | authenticated | `true` |
| Admins can manage frequency_config | ALL | public | `has_role(auth.uid(), 'admin')` |

### `modules`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Modules are viewable by authenticated users | SELECT | authenticated | `true` |
| Admins can manage modules | ALL | public | `has_role(auth.uid(), 'admin')` |

### `levels`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can read levels | SELECT | authenticated | `true` |
| Admins can insert levels | INSERT | authenticated | `has_role(auth.uid(), 'admin')` |
| Admins can update levels | UPDATE | authenticated | `has_role(auth.uid(), 'admin')` |
| Admins can delete levels | DELETE | authenticated | `has_role(auth.uid(), 'admin')` |

---

## 11. Organization Structure

### `divisions`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view divisions | SELECT | authenticated | `true` |
| Admins can manage divisions | ALL | authenticated | `has_role(auth.uid(), 'admin')` |

### `business_units`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view business_units | SELECT | authenticated | `true` |
| Admins can manage business_units | ALL | authenticated | `has_role(auth.uid(), 'admin')` |

### `departments`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view departments | SELECT | authenticated | `true` |
| Admins can manage departments | ALL | authenticated | `has_role(auth.uid(), 'admin')` |

### `designations`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view designations | SELECT | public | `true` |
| Admins can manage designations | ALL | public | `has_role(auth.uid(), 'admin')` |

### `sub_branches`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view sub_branches | SELECT | authenticated | `true` |
| Admins can manage sub_branches | ALL | authenticated | `has_role(auth.uid(), 'admin')` |

### `pms_grades`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view pms_grades | SELECT | public | `true` |
| Admins can manage pms_grades | ALL | public | `has_role(auth.uid(), 'admin')` |

---

## 12. Workflow Configuration

### `workflow_templates`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view workflow_templates | SELECT | authenticated | `true` |
| Admins can manage workflow_templates | ALL | public | `has_role(auth.uid(), 'admin')` |

### `workflow_config`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view workflow_config | SELECT | authenticated | `true` |
| Admins can manage workflow_config | ALL | public | `has_role(auth.uid(), 'admin')` |

### `workflow_settings`
| Policy | Cmd | Roles | Condition |
|--------|-----|-------|-----------|
| Authenticated users can view workflow settings | SELECT | authenticated | `true` |
| Only admins can update workflow settings | UPDATE | public | Admin check via `user_roles` table |

---

## Security Helper Functions

| Function | Type | Purpose |
|----------|------|---------|
| `has_role(uuid, app_role)` | SECURITY DEFINER | Checks role in `user_roles` without triggering RLS recursion |
| `get_user_role(uuid)` | SECURITY DEFINER | Returns primary role |
| `get_skip_level_manager(uuid)` | SECURITY DEFINER | Returns manager's manager UUID |
| `get_direct_report_ids(uuid)` | SECURITY DEFINER | Returns set of direct report UUIDs |
| `is_data_owner_for_employee(uuid, uuid)` | SECURITY DEFINER | Checks org KPI data ownership chain |
| `is_period_locked(text, int)` | SECURITY DEFINER | Checks if review period is locked |
| `check_template_has_active_kpis(uuid)` | SECURITY DEFINER | Checks if workflow template has in-progress KPIs |
