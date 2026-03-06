import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useReviewPeriodGovernance } from '@/hooks/useReviewPeriodGovernance';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Shield, Activity, Building2, User, Zap, ScrollText, FileText, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { STAGE_LABELS } from '@/hooks/useReviewPeriodGovernance';
import ReviewPeriodOverview from '@/components/admin/ReviewPeriodOverview';
import ReviewPeriodStageController from '@/components/admin/ReviewPeriodStageController';
import ReviewPeriodRolePermissions from '@/components/admin/ReviewPeriodRolePermissions';
import ReviewPeriodDepartmentLocks from '@/components/admin/ReviewPeriodDepartmentLocks';
import ReviewPeriodEmployeeLocks from '@/components/admin/ReviewPeriodEmployeeLocks';
import ReviewPeriodAutoRules from '@/components/admin/ReviewPeriodAutoRules';
import ReviewPeriodAuditLog from '@/components/admin/ReviewPeriodAuditLog';

interface PeriodOption {
  id: string;
  period_name: string;
  review_year: number;
  current_stage: string;
  stage_started_at: string | null;
  completion_percentage: number;
  is_locked: boolean;
  kpi_count: number;
}

export default function ReviewPeriods() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  // Fetch all review periods with KPI counts
  const { data: periods, isLoading } = useQuery({
    queryKey: ['review-periods-admin'],
    queryFn: async () => {
      // Get all KPI period/year combos
      const { data: kpiData, error: kpiErr } = await supabase
        .from('kpis')
        .select('review_period, review_year')
        .not('review_period', 'is', null)
        .not('review_year', 'is', null);
      if (kpiErr) throw kpiErr;

      const periodCounts: Record<string, number> = {};
      kpiData?.forEach(kpi => {
        const key = `${kpi.review_period}-${kpi.review_year}`;
        periodCounts[key] = (periodCounts[key] || 0) + 1;
      });

      // Get existing review_periods records
      const { data: rpData, error: rpErr } = await supabase
        .from('review_periods')
        .select('*');
      if (rpErr) throw rpErr;

      // Merge: create period options
      const allKeys = new Set([
        ...Object.keys(periodCounts),
        ...(rpData || []).map(rp => `${rp.period_name}-${rp.review_year}`),
      ]);

      const result: PeriodOption[] = [];
      allKeys.forEach(key => {
        const [periodName, yearStr] = key.split('-');
        const year = parseInt(yearStr);
        const existing = rpData?.find(rp => rp.period_name === periodName && rp.review_year === year);
        result.push({
          id: existing?.id || '',
          period_name: periodName,
          review_year: year,
          current_stage: (existing as any)?.current_stage || 'planning',
          stage_started_at: (existing as any)?.stage_started_at || null,
          completion_percentage: (existing as any)?.completion_percentage || 0,
          is_locked: existing?.is_locked || false,
          kpi_count: periodCounts[key] || 0,
        });
      });

      // Sort by year desc, then month
      const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      result.sort((a, b) => b.review_year - a.review_year || MONTHS.indexOf(b.period_name) - MONTHS.indexOf(a.period_name));

      return result;
    },
  });

  // Auto-select first period, or ensure period record exists
  const selectedPeriod = periods?.find(p => p.id === selectedPeriodId) || null;

  // Ensure the selected period has a DB record (create if needed)
  const ensurePeriodRecord = useMutation({
    mutationFn: async (period: PeriodOption) => {
      if (period.id) return period.id;
      const { data, error } = await supabase
        .from('review_periods')
        .insert({
          period_name: period.period_name,
          review_year: period.review_year,
          is_locked: false,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['review-periods-admin'] });
      setSelectedPeriodId(id);
    },
  });

  const handleSelectPeriod = (key: string) => {
    const period = periods?.find(p => `${p.period_name}-${p.review_year}` === key);
    if (!period) return;
    if (period.id) {
      setSelectedPeriodId(period.id);
    } else {
      ensurePeriodRecord.mutate(period);
    }
  };

  // Governance hook
  const governance = useReviewPeriodGovernance(selectedPeriod?.id || null);

  const globalLock = governance.locks.find(l => l.lock_type === 'global');

  const handleToggleGlobalLock = (lock: boolean) => {
    if (!selectedPeriod?.id) return;
    governance.upsertLock({
      lock_type: 'global',
      permissions: {
        edit_kpi: !lock, submit_self_review: !lock, submit_manager_review: !lock,
        approve: !lock, edit_scores: !lock, add_comments: !lock, view_only: lock,
      },
      is_locked: lock,
      reason: lock ? 'Global lock activated' : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Calendar className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Review Period Governance</h1>
            <p className="text-muted-foreground">Manage lifecycle stages, locks, and permissions</p>
          </div>
        </div>

        {/* Period Selector + Help */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/governance-explainer">
              <HelpCircle className="h-4 w-4 mr-1" /> Explainer
            </Link>
          </Button>
          <Select
            value={selectedPeriod ? `${selectedPeriod.period_name}-${selectedPeriod.review_year}` : ''}
            onValueChange={handleSelectPeriod}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a review period..." />
            </SelectTrigger>
            <SelectContent>
              {(periods || []).map(p => (
                <SelectItem key={`${p.period_name}-${p.review_year}`} value={`${p.period_name}-${p.review_year}`}>
                  {p.period_name} {p.review_year} — {p.kpi_count} KRAs
                  {p.is_locked && ' 🔒'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading / Empty */}
      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Loading periods...</CardContent></Card>
      ) : !selectedPeriod ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>Select a review period above to manage its governance settings.</p>
            {(!periods || periods.length === 0) && (
              <p className="text-sm mt-1">No review periods found. They appear once KRAs are assigned.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Governance Tabs */
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="stages" className="gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Stages
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Roles
            </TabsTrigger>
            <TabsTrigger value="departments" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Departments
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-1.5">
              <User className="h-3.5 w-3.5" /> Employees
            </TabsTrigger>
            <TabsTrigger value="auto-rules" className="gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Auto Rules
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <ScrollText className="h-3.5 w-3.5" /> Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ReviewPeriodOverview
              period={selectedPeriod}
              globalLockActive={globalLock?.is_locked ?? false}
              onToggleGlobalLock={handleToggleGlobalLock}
              lockPending={governance.upsertingLock}
            />
          </TabsContent>

          <TabsContent value="stages">
            <ReviewPeriodStageController
              currentStage={selectedPeriod.current_stage}
              stageHistory={governance.stageHistory}
              onAdvanceStage={governance.advanceStage}
              isPending={governance.advancingStage}
            />
          </TabsContent>

          <TabsContent value="roles">
            <ReviewPeriodRolePermissions
              locks={governance.locks}
              onSaveRoleLock={governance.upsertLock}
              saving={governance.upsertingLock}
            />
          </TabsContent>

          <TabsContent value="departments">
            <ReviewPeriodDepartmentLocks
              locks={governance.locks}
              onToggleLock={governance.upsertLock}
              saving={governance.upsertingLock}
            />
          </TabsContent>

          <TabsContent value="employees">
            <ReviewPeriodEmployeeLocks
              locks={governance.locks}
              onToggleLock={governance.upsertLock}
              saving={governance.upsertingLock}
            />
          </TabsContent>

          <TabsContent value="auto-rules">
            <ReviewPeriodAutoRules periodId={selectedPeriod.id} />
          </TabsContent>

          <TabsContent value="audit">
            <ReviewPeriodAuditLog
              periodId={selectedPeriod.id}
              auditLog={governance.auditLog}
              loading={governance.loadingAudit}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
