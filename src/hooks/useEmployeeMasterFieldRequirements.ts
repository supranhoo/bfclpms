import { useSystemSetting } from '@/hooks/useSystemSettings';
import {
  parseRequirements,
  DEFAULT_REQUIREMENTS,
  type EmployeeMasterFieldRequirements,
} from '@/lib/employeeMasterFields';

export const EMPLOYEE_MASTER_FIELDS_SETTING_KEY = 'employee_master_field_requirements';

export function useEmployeeMasterFieldRequirements(): {
  requirements: EmployeeMasterFieldRequirements;
  isLoading: boolean;
} {
  const { data, isLoading } = useSystemSetting(EMPLOYEE_MASTER_FIELDS_SETTING_KEY);
  const requirements = data?.setting_value
    ? parseRequirements(data.setting_value)
    : DEFAULT_REQUIREMENTS;
  return { requirements, isLoading };
}