/**
 * ADR-208 — full-page Create PIP screen (`/admin/pip/new`).
 *
 * Prefill contract:
 *   ?employee=<uuid>            employee to preselect
 *   ?trigger=<source>           monthly_trend | annual_rating | manual
 *   ?from=Month-Year&to=Month-Year   evaluation window for the KPI picker
 *   router state { reason, triggerContext }  policy-worded evidence text
 */
import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { PIPCreateForm } from '@/components/pip/PIPCreateForm';
import { buildMonthRange, type MonthKey } from '@/hooks/useMonthlyTrend';
import { trailingWindow } from '@/hooks/usePIPCandidates';

function parseMonthParam(raw: string | null): { month: string; year: number } | null {
  if (!raw) return null;
  const [month, year] = raw.split('-');
  const y = Number(year);
  if (!month || !Number.isFinite(y)) return null;
  return { month, year: y };
}

export default function PIPCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const state = (location.state ?? {}) as {
    reason?: string;
    triggerContext?: Record<string, unknown> | null;
  };

  const employeeId = params.get('employee') || undefined;
  const triggerSource = params.get('trigger') || 'manual';

  const months = useMemo<MonthKey[]>(() => {
    const from = parseMonthParam(params.get('from'));
    const to = parseMonthParam(params.get('to'));
    if (from && to) return buildMonthRange(from.month, from.year, to.month, to.year);
    const fallback = trailingWindow(3, new Date());
    return buildMonthRange(fallback.fromMonth, fallback.fromYear, fallback.toMonth, fallback.toYear);
  }, [params]);

  const back = () => navigate('/admin/pip');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Create Performance Improvement Plan"
        description="Set up a structured improvement plan with milestones, support and success criteria."
        backTo="/admin/pip"
      />

      <PIPCreateForm
        preselectedEmployeeId={employeeId}
        prefillReason={state.reason}
        triggerSource={triggerSource}
        triggerContext={state.triggerContext ?? null}
        months={months}
        onCancel={back}
        onCreated={back}
      />
    </div>
  );
}
