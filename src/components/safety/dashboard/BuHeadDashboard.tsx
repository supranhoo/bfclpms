import { useMySafetyRoles } from '@/hooks/useSafetyRoles';
import DeptRiskWidget from './DeptRiskWidget';
import RepeatHeatmapWidget from './RepeatHeatmapWidget';
import AtRiskWidget from './AtRiskWidget';

/**
 * BuHeadDashboard
 * ---------------
 * Role-aware additive dashboard block. Only renders when the current user
 * holds `bu_head`, `safety_head`, or `admin`. Existing SafetyHome tiles
 * are not touched.
 */
const ELIGIBLE_ROLES = new Set(['bu_head', 'safety_head', 'admin']);

export default function BuHeadDashboard() {
  const { data: roles = [] } = useMySafetyRoles();
  const eligible = roles.some((r) => ELIGIBLE_ROLES.has(r));
  if (!eligible) return null;

  return (
    <section
      aria-label="BU Head dashboard"
      className="space-y-4"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DeptRiskWidget months={6} />
        <AtRiskWidget threshold={3} />
      </div>
      <RepeatHeatmapWidget />
    </section>
  );
}