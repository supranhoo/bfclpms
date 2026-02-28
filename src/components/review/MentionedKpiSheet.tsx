import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Eye, Target, TrendingUp, User, MessageSquare } from 'lucide-react';
import { useKpiObservations, type KpiObservation } from '@/hooks/useKpiObservations';
import { ObservationReplyThread } from '@/components/review/ObservationReplyThread';
import { FormattedText } from '@/components/ui/FormattedText';
import { formatDistanceToNow } from 'date-fns';

interface MentionedKpiSheetProps {
  kpiId: string;
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useKpiDetails(kpiId: string | undefined) {
  return useQuery({
    queryKey: ['mentioned-kpi-details', kpiId],
    queryFn: async () => {
      if (!kpiId) return null;
      const { data, error } = await supabase
        .from('kpis')
        .select('id, kpi_name, kra_name, target_value, uom, criteria, weightage, status, review_period, review_year, is_org_level')
        .eq('id', kpiId)
        .single();
      if (error) throw error;
      return data;
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

function ObservationItem({ observation, kpiId }: { observation: KpiObservation; kpiId: string }) {
  const [showReplies, setShowReplies] = useState(false);
  const typeColors: Record<string, string> = {
    positive: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    concern: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    neutral: 'bg-muted text-muted-foreground',
  };

  return (
    <Card className="border-border/50">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={typeColors[observation.observation_type] || ''}>
                {observation.observation_type}
              </Badge>
              <Badge variant="outline" className="text-xs">{observation.status}</Badge>
              {observation.score_impact !== 0 && (
                <span className="text-xs text-muted-foreground">
                  Impact: {observation.score_impact > 0 ? '+' : ''}{observation.score_impact}
                </span>
              )}
            </div>
            <p className="text-sm font-medium mt-1">
              <FormattedText text={observation.title} />
            </p>
            {observation.description && (
              <p className="text-xs text-muted-foreground mt-1">
                <FormattedText text={observation.description} />
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            By {observation.created_by_profile?.full_name || observation.created_by_profile?.email || 'Unknown'} · {formatDistanceToNow(new Date(observation.created_at), { addSuffix: true })}
          </span>
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            Replies
          </button>
        </div>
        {showReplies && (
          <div className="mt-2 border-t pt-2">
            <ObservationReplyThread
              observationId={observation.id}
              kpiId={kpiId}
              observationCreatedBy={observation.created_by}
              isReadOnly={true}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MentionedKpiSheet({ kpiId, employeeId, open, onOpenChange }: MentionedKpiSheetProps) {
  const { data: kpi, isLoading: kpiLoading } = useKpiDetails(kpiId);
  const { data: employee, isLoading: empLoading } = useEmployeeProfile(employeeId);
  const { data: observations, isLoading: obsLoading } = useKpiObservations(kpiId);

  // Filter to public observations only
  const publicObservations = observations?.filter(o => o.visibility === 'public') || [];

  const initials = employee?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <Badge variant="secondary" className="text-xs">Read-Only via @Mention</Badge>
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

            {/* KPI details */}
            {kpi && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{kpi.kra_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-medium">{kpi.kpi_name}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Target: {kpi.target_value ?? '—'} {kpi.uom || ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Weight: {kpi.weightage ?? 0}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Criteria: {kpi.criteria || '—'}</span>
                    </div>
                    <div>
                      <Badge variant="outline" className="text-xs">
                        {kpi.review_period} {kpi.review_year}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Observations */}
            <div>
              <h3 className="text-sm font-semibold mb-2">
                Observations ({publicObservations.length})
              </h3>
              {obsLoading ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : publicObservations.length === 0 ? (
                <p className="text-xs text-muted-foreground">No public observations</p>
              ) : (
                <div className="space-y-2">
                  {publicObservations.map(obs => (
                    <ObservationItem key={obs.id} observation={obs} kpiId={kpiId} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
