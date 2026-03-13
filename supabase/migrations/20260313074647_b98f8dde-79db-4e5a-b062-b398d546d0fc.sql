-- Drop old single-param RPC overloads that conflict with the new DEFAULT NULL versions
DROP FUNCTION IF EXISTS public.get_employee_workflow(uuid);
DROP FUNCTION IF EXISTS public.get_employee_workflow_info(uuid);
DROP FUNCTION IF EXISTS public.get_bulk_employee_workflows(uuid[]);