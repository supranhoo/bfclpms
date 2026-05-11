import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployeeWorkflowStages } from '@/hooks/useWorkflowConfig';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Eye } from 'lucide-react';
import { KpiReviewPanel } from './KpiReviewPanel';
import { KPI, ReviewSubmission } from '@/hooks/useKpis';
import { Skeleton } from '@/components/ui/skeleton';

interface MentionedKpiSheetProps {
  kpiId: string;
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useFullKpiDetails(kpiId: string | undefined) {
  return useQuery({
    queryKey: ['mentioned-kpi-full', kpiId],
    queryFn: async () => {
      if (!kpiId) return null;
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          *,
          kra_categories (id, name, color, weightage)
        `)
        .eq('id', kpiId)
        .single();
      if (error) throw error;
      return data as unknown as KPI;
    },
    enabled: !!kpiId,
  });
}

function useSubmissionForKpi(kpiId: string | undefined) {
  return useQuery({
    queryKey: ['mentioned-kpi-submission', kpiId],
    queryFn: async () => {
      if (!kpiId) return null;
      const { data, error } = await supabase
        .from('review_submissions')
        .select('*')
        .eq('kpi_id', kpiId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ReviewSubmission | null;
    },
    enabled: !!kpiId,
  });
}

function useEmployeeProfile(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['mentioned-employee-profile', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, designation, employee_code')
        .eq('id', employeeId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });
}

export function MentionedKpiSheet({ kpiId, employeeId, open, onOpenChange }: MentionedKpiSheetProps) {
  const { user } = useAuth();
  const { data: kpi, isLoading: kpiLoading } = useFullKpiDetails(kpiId);
  const { data: submission, isLoading: subLoading } = useSubmissionForKpi(kpiId);
  const { data: employee } = useEmployeeProfile(employeeId);
  // ADR-061 / Mention parity: resolve the KPI's actual workflow for THIS employee + period
  // so the Review Journey hides stages (e.g. Management) that aren't part of the workflow.
  const { data: resolvedStages, isLoading: wfLoading } = useEmployeeWorkflowStages(
    employeeId,
    kpi?.review_period,
    kpi?.review_year,
  );

  const initials = employee?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

  const isLoading = kpiLoading || subLoading || wfLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-4xl overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <Badge variant="secondary" className="text-xs">Via @Mention</Badge>
          </div>
          <SheetTitle className="text-left">KPI Details</SheetTitle>
          <SheetDescription className="text-left">
            You were mentioned in an observation on this KPI
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-6">
            {/* Employee info */}
            {employee && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{employee.full_name || employee.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {[employee.designation, employee.employee_code].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            )}

            {/* KPI Review Panel - reuses existing dashboard component */}
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : kpi ? (
              <KpiReviewPanel
                kpi={kpi}
                submission={submission ?? null}
                allKpis={kpi ? [kpi] : []}
                allSubmissions={submission ? [submission] : []}
                viewLevel="employee"
                currentUserId={user?.id}
                selectedPeriod={kpi.review_period || ''}
                selectedYear={kpi.review_year || new Date().getFullYear()}
                employeeName={employee?.full_name || undefined}
                employeeCode={employee?.employee_code || undefined}
                workflowStages={resolvedStages ?? undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                KPI not found or access denied.
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
