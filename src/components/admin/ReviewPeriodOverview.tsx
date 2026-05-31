import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Lock, Unlock, Calendar, Activity } from 'lucide-react';
import { STAGE_LABELS, GOVERNANCE_STAGES, GovernanceStage } from '@/hooks/useReviewPeriodGovernance';
import { format } from 'date-fns';

interface Props {
  period: {
    id: string;
    period_name: string;
    review_year: number;
    current_stage: string;
    stage_started_at: string | null;
    completion_percentage: number;
    is_locked: boolean;
    kpi_count: number;
  };
  globalLockActive: boolean;
  onToggleGlobalLock: (lock: boolean) => void;
  lockPending: boolean;
}

const stageColors: Record<string, string> = {
  planning: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  self_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  manager_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  calibration: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  approval: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  closed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function ReviewPeriodOverview({ period, globalLockActive, onToggleGlobalLock, lockPending }: Props) {
  const currentIdx = GOVERNANCE_STAGES.indexOf(period.current_stage as GovernanceStage);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Period</p>
                <p className="text-lg font-semibold">{period.period_name} {period.review_year}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Current Stage</p>
                <Badge className={stageColors[period.current_stage] || ''}>
                  {STAGE_LABELS[period.current_stage] || period.current_stage}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-2">Completion</p>
            <div className="flex items-center gap-2">
              <Progress value={period.completion_percentage} className="flex-1" />
              <span className="text-sm font-medium">{period.completion_percentage}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-2">Global Lock</p>
            <Button
              variant={globalLockActive ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => onToggleGlobalLock(!globalLockActive)}
              disabled={lockPending}
              className="w-full"
            >
              {globalLockActive ? (
                <><Lock className="h-4 w-4 mr-1.5" /> Locked — Click to Unlock</>
              ) : (
                <><Unlock className="h-4 w-4 mr-1.5" /> Open — Click to Lock</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Stage Progress Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1">
            {GOVERNANCE_STAGES.map((stage, idx) => {
              const isComplete = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              return (
                <div key={stage} className="flex-1 flex flex-col items-center">
                  <div
                    className={`h-2 w-full rounded-full ${
                      isComplete
                        ? 'bg-primary'
                        : isCurrent
                          ? 'bg-primary/60'
                          : 'bg-muted'
                    }`}
                  />
                  <span className={`text-xs mt-1 ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                    {STAGE_LABELS[stage]}
                  </span>
                </div>
              );
            })}
          </div>
          {period.stage_started_at && (
            <p className="text-xs text-muted-foreground mt-3">
              Stage started: {format(new Date(period.stage_started_at), 'dd MMM yyyy, hh:mm a')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{period.kpi_count}</p>
              <p className="text-sm text-muted-foreground">Total KRAs</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{period.is_locked ? '🔒' : '🔓'}</p>
              <p className="text-sm text-muted-foreground">Legacy Lock</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{currentIdx + 1}/{GOVERNANCE_STAGES.length}</p>
              <p className="text-sm text-muted-foreground">Stage Progress</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{globalLockActive ? 'Active' : 'None'}</p>
              <p className="text-sm text-muted-foreground">Global Lock</p>
            </div>
            <div title="When the period stage reaches Closed it blocks non-admin edits, independent of Legacy/Global locks. Admins may still edit (audit-logged).">
              <p className="text-2xl font-bold">
                {period.current_stage === 'closed' ? '🔒' : '🔓'}
              </p>
              <p className="text-sm text-muted-foreground">
                Stage Lock {period.current_stage === 'closed' ? '(Closed)' : ''}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
