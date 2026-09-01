/**
 * ADR-322 / ADR-335 — pick the people who may enter this org-level KPI's value.
 *
 * Thin wrapper: the implementation now lives in the shared
 * `OrgKpiDataOwnersField` so the Performance Console and the Admin KPI forms
 * can never drift. See POLICY §KPI-SCOPE-SINGLE-VOCABULARY.
 */
import { OrgKpiDataOwnersField } from '@/components/admin/org-kpi/OrgKpiDataOwnersField';

interface Props {
  categoryId: string;
  kraName: string;
  kpiName: string;
}

export function GroupDataOwnersField({ categoryId, kraName, kpiName }: Props) {
  return (
    <OrgKpiDataOwnersField
      mode="immediate"
      categoryId={categoryId}
      kraName={kraName}
      kpiName={kpiName}
    />
  );
}
