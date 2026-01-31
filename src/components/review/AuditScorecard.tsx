import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useKpisByEmployee, useReviewSubmissions, useKpiQueries, RatingLevel, KPI } from '@/hooks/useKpis';
import { useSubPeriodSubmissions } from '@/hooks/useSubPeriodSubmissions';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import { QualitativeOption } from '@/lib/qualitativeUom';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { OverallScoreChart } from '@/components/dashboard/OverallScoreChart';
import { CategoryScoreChart } from '@/components/dashboard/CategoryScoreChart';
import { ReviewTrailCard } from '@/components/review/ReviewTrailCard';
import { RatingScaleDisplay } from '@/components/review/RatingScaleDisplay';
import { AchievedValueScoreInput } from '@/components/review/AchievedValueScoreInput';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { scoreToRating } from '@/components/review/ScoreSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Target, CheckCircle2, Clock, 
  Info, Undo2, Check, Shield, User, FileCheck
} from 'lucide-react';
import { 
  statusColors,
  statusLabels,
  ratingOptions
} from '@/lib/reviewConstants';

interface AuditScorecardProps {
  employee: {
    id: string;
    full_name: string | null;
    email: string;
    designation: string | null;
    employee_code: string | null;
    avatar_url: string | null;
    department_id: string | null;
  };
  selectedPeriod: string;
  selectedYear: number;
  onBack: () => void;
  autoOpenKpiId?: string | null;
}

export function AuditScorecard({ 
  employee, 
  selectedPeriod, 
  selectedYear, 
  onBack,
  autoOpenKpiId 
}: AuditScorecardProps) {
  const { user } = useAuth();
  const { data: allKpis, isLoading } = useKpisByEmployee(employee.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Filter KPIs by period and year
  const kpis = useMemo(() => allKpis?.filter(k => {
    const periodMatch = k.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
    const yearMatch = k.review_year === selectedYear;
    return periodMatch && yearMatch;
  }), [allKpis, selectedPeriod, selectedYear]);

  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const { data: queries } = useKpiQueries(kpiIds);

  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [sendBackDialogOpen, setSendBackDialogOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  
  const [auditorScore, setAuditorScore] = useState<number | null>(null);
  const [auditorRemarks, setAuditorRemarks] = useState('');
  const [auditorEvidenceUrl, setAuditorEvidenceUrl] = useState<string | null>(null);
  const [auditorAchievedValue, setAuditorAchievedValue] = useState<number | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');
  const [sendBackTarget, setSendBackTarget] = useState<'manager' | 'employee'>('manager');

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));
  const queryMap = new Map<string, typeof queries>();
  queries?.forEach(q => {
    const existing = queryMap.get(q.kpi_id) || [];
    queryMap.set(q.kpi_id, [...existing, q]);
  });

  // Calculate scores
  const scoreData = useMemo(() => {
    if (!kpis || !submissions) return { overallScore: 0, rating: 0, categoryScores: [] };
    
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const categoryMap = new Map<string, { totalScore: number; totalWeight: number; color: string | null }>();
    
    kpis.forEach(kpi => {
      const submission = submissionMap.get(kpi.id);
      if (submission?.is_na) return; // Skip NA KPIs
      
      const score = submission?.auditor_score || submission?.manager_score || submission?.self_score || 0;
      const weight = kpi.weightage || 0;
      const categoryName = kpi.kra_categories?.name || 'Other';
      const categoryColor = kpi.kra_categories?.color || null;
      
      if (score > 0 && weight > 0) {
        totalWeightedScore += score * weight;
        totalWeight += weight;
        
        const existing = categoryMap.get(categoryName) || { totalScore: 0, totalWeight: 0, color: categoryColor };
        existing.totalScore += score * weight;
        existing.totalWeight += weight;
        categoryMap.set(categoryName, existing);
      }
    });
    
    const overallRating = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const overallScore = (overallRating / 5) * 100;
    
    const categoryScores = Array.from(categoryMap.entries()).map(([name, data]) => ({
      name,
      percentage: data.totalWeight > 0 ? ((data.totalScore / data.totalWeight) / 5) * 100 : 0,
      color: data.color,
    }));
    
    return { overallScore, rating: overallRating, categoryScores };
  }, [kpis, submissions, submissionMap]);

  // Stats for audit review
  const pendingAuditCount = kpis?.filter(k => k.status === 'manager_check').length || 0;
  const inAuditCount = kpis?.filter(k => k.status === 'audit').length || 0;
  const forwardedCount = kpis?.filter(k => ['management_review', 'approved'].includes(k.status || '')).length || 0;
  const totalKpis = kpis?.length || 0;

  const submitAuditReview = useMutation({
    mutationFn: async ({
      kpi_id,
      auditor_rating,
      auditor_score,
      auditor_remarks,
      auditor_evidence_url,
      approve,
    }: {
      kpi_id: string;
      auditor_rating: RatingLevel;
      auditor_score: number;
      auditor_remarks: string;
      auditor_evidence_url?: string | null;
      approve: boolean;
    }) => {
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          auditor_rating,
          auditor_score,
          auditor_remarks,
          auditor_evidence_url,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      const newStatus = approve ? 'management_review' : 'audit';
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: approve ? 'AUDITOR_FORWARDED_TO_MANAGEMENT' : 'AUDITOR_REVIEWED',
          performed_by: user.id,
          new_value: { auditor_rating, auditor_score, auditor_remarks },
          metadata: { forwarded_at: approve ? new Date().toISOString() : null },
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ 
        title: variables.approve ? 'Forwarded to Management Review' : 'Audit review saved'
      });
      setReviewSheetOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit audit', description: error.message, variant: 'destructive' });
    },
  });

  const sendBack = useMutation({
    mutationFn: async ({
      kpi_id,
      target,
      reason,
    }: {
      kpi_id: string;
      target: string;
      reason: string;
    }) => {
      const statusMap: Record<string, string> = {
        manager: 'self_review',
        employee: 'kra_set',
      };

      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: statusMap[target] as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          auditor_rating: null,
          auditor_score: null,
          auditor_remarks: null,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: `AUDITOR_SENT_BACK_TO_${target.toUpperCase()}`,
          performed_by: user.id,
          new_value: { reason, target },
          metadata: { sent_back_at: new Date().toISOString() },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'KPI sent back successfully' });
      setSendBackDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send back', description: error.message, variant: 'destructive' });
    },
  });

  const openReviewSheet = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    setAuditorScore(existing?.auditor_score || existing?.manager_score || null);
    setAuditorRemarks(existing?.auditor_remarks || '');
    setAuditorEvidenceUrl(existing?.auditor_evidence_url || null);
    setAuditorAchievedValue((existing as any)?.auditor_achieved_value || (existing as any)?.manager_achieved_value || existing?.achieved_value || null);
    setReviewSheetOpen(true);
  };

  const handleSubmitReview = (approve: boolean) => {
    if (!selectedKpi || auditorScore === null) return;
    const rating = scoreToRating(auditorScore);
    submitAuditReview.mutate({
      kpi_id: selectedKpi.id,
      auditor_rating: rating,
      auditor_score: auditorScore,
      auditor_remarks: auditorRemarks,
      auditor_evidence_url: auditorEvidenceUrl,
      approve,
    });
  };

  const openSendBackDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setSendBackReason('');
    setSendBackTarget('manager');
    setSendBackDialogOpen(true);
  };

  const handleSendBack = () => {
    if (!selectedKpi || !sendBackReason.trim()) return;
    sendBack.mutate({
      kpi_id: selectedKpi.id,
      target: sendBackTarget,
      reason: sendBackReason,
    });
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <Avatar className="h-12 w-12">
            <AvatarImage src={employee.avatar_url || undefined} />
            <AvatarFallback>{getInitials(employee.full_name)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{employee.full_name || employee.email}</h1>
            <p className="text-muted-foreground">
              {employee.designation || 'Employee'} {employee.employee_code ? `• ${employee.employee_code}` : ''}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-base px-4 py-2">
          {selectedPeriod} {selectedYear}
        </Badge>
      </div>

      {/* Score Overview */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Overall Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <OverallScoreChart percentage={scoreData.overallScore} rating={scoreData.rating} />
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Category Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <CategoryScoreChart data={scoreData.categoryScores} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total KPIs</p>
                <p className="text-2xl font-bold">{totalKpis}</p>
              </div>
              <Target className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Pending Audit</p>
                <p className="text-2xl font-bold text-amber-600">{pendingAuditCount}</p>
              </div>
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">In Audit</p>
                <p className="text-2xl font-bold text-purple-600">{inAuditCount}</p>
              </div>
              <FileCheck className="h-5 w-5 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Forwarded</p>
                <p className="text-2xl font-bold text-green-600">{forwardedCount}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            KPI Details - Audit Review
          </CardTitle>
          <CardDescription>Verify and validate KPI evaluations</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>KRA / KPI</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Achieved</TableHead>
                <TableHead>Manager Score</TableHead>
                <TableHead>Auditor Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kpis?.map(kpi => {
                const submission = submissionMap.get(kpi.id);
                const isNaKpi = submission?.is_na || false;
                const canAudit = (kpi.status === 'manager_check' || kpi.status === 'audit') && !isNaKpi;
                const isForwarded = kpi.status === 'management_review' || kpi.status === 'approved';
                
                return (
                  <TableRow 
                    key={kpi.id} 
                    className={`${isForwarded ? 'opacity-75 bg-muted/30' : ''} ${isNaKpi ? 'opacity-60 bg-muted/20' : ''}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: kpi.kra_categories?.color || '#6B7280' }}
                        />
                        <span className="text-sm">{kpi.kra_categories?.name || 'Uncategorized'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
                        className="text-left hover:bg-muted/50 p-1 -m-1 rounded transition-colors cursor-pointer group w-full"
                        title="Click to view KPI details"
                      >
                        <p className="font-medium text-primary group-hover:underline">{kpi.kra_name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          {kpi.kpi_name}
                          <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                      </button>
                    </TableCell>
                    <TableCell>{kpi.target_value ?? '-'}</TableCell>
                    <TableCell>
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">N/A</Badge>
                      ) : (
                        submission?.achieved_value ?? '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">N/A</Badge>
                      ) : submission?.manager_score ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{submission.manager_score}/5</span>
                          {submission.manager_rating && (
                            <Badge
                              style={{
                                backgroundColor: ratingOptions.find(r => r.value === submission.manager_rating)?.color,
                              }}
                              className="text-white text-xs"
                            >
                              {ratingOptions.find(r => r.value === submission.manager_rating)?.label}
                            </Badge>
                          )}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">N/A</Badge>
                      ) : submission?.auditor_score ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{submission.auditor_score}/5</span>
                          {submission.auditor_rating && (
                            <Badge
                              style={{
                                backgroundColor: ratingOptions.find(r => r.value === submission.auditor_rating)?.color,
                              }}
                              className="text-white text-xs"
                            >
                              {ratingOptions.find(r => r.value === submission.auditor_rating)?.label}
                            </Badge>
                          )}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[kpi.status || 'kra_set']}>
                        {statusLabels[kpi.status || 'kra_set']}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {canAudit && (
                          <>
                            <Button 
                              size="sm" 
                              onClick={() => openReviewSheet(kpi)}
                            >
                              {kpi.status === 'audit' ? 'Continue' : 'Audit'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => openSendBackDialog(kpi)}
                            >
                              <Undo2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        {isForwarded && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Forwarded
                          </Badge>
                        )}
                        {isNaKpi && (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">
                            Not Applicable
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {kpis?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No KPIs found for this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit Review Sheet */}
      <Sheet open={reviewSheetOpen} onOpenChange={setReviewSheetOpen}>
        <SheetContent size="lg" className="flex flex-col h-full overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <SheetTitle>Audit Review</SheetTitle>
                <SheetDescription>Verify and validate KPI evaluation</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-4">
            {/* KPI Info */}
            {selectedKpi && (
              <Card>
                <CardContent className="pt-4 space-y-2">
                  <p className="font-medium text-primary">{selectedKpi.kra_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedKpi.kpi_name}</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Target:</span>
                      <p className="font-medium">{selectedKpi.target_value} {selectedKpi.uom}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Criteria:</span>
                      <p className="font-medium">{selectedKpi.criteria || 'Higher is Better'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Weightage:</span>
                      <p className="font-medium">{selectedKpi.weightage}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rating Scale */}
            <RatingScaleDisplay kpi={selectedKpi} compact />

            {/* Review Trail */}
            {selectedKpi && submissionMap.get(selectedKpi.id) && (
              <ReviewTrailCard
                submission={submissionMap.get(selectedKpi.id)!}
                queries={queryMap.get(selectedKpi.id) || []}
              />
            )}
            
            {/* Daily Submission Summary - Fetch and display for Daily KPIs */}
            {selectedKpi && (
              <DailySubmissionSummaryWrapper 
                kpi={selectedKpi} 
                selectedPeriod={selectedPeriod} 
                selectedYear={selectedYear} 
              />
            )}

            {/* Auditor Assessment */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-500" />
                  Auditor Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedKpi && (
                  <AchievedValueScoreInput
                    kpi={selectedKpi}
                    achievedValue={auditorAchievedValue}
                    score={auditorScore}
                    onAchievedValueChange={setAuditorAchievedValue}
                    onScoreChange={(score, rating) => setAuditorScore(score)}
                    label="Auditor Assessment"
                  />
                )}
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    placeholder="Add your audit comments..."
                    value={auditorRemarks}
                    onChange={(e) => setAuditorRemarks(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Evidence</Label>
                  <EvidenceUpload
                    userId={user?.id || ''}
                    kpiId={selectedKpi?.id || ''}
                    onUploadComplete={(url) => setAuditorEvidenceUrl(url)}
                    existingUrl={auditorEvidenceUrl}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <SheetFooter className="pt-4 border-t gap-2">
            <Button variant="outline" onClick={() => setReviewSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSubmitReview(false)}
              disabled={auditorScore === null || submitAuditReview.isPending}
            >
              Save Draft
            </Button>
            <Button
              onClick={() => handleSubmitReview(true)}
              disabled={auditorScore === null || submitAuditReview.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Check className="h-4 w-4 mr-2" />
              Forward to Management
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Send Back Dialog */}
      <Dialog open={sendBackDialogOpen} onOpenChange={setSendBackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back KPI</DialogTitle>
            <DialogDescription>
              Send this KPI back for revision. Select who should receive it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Send To</Label>
              <div className="flex gap-2">
                {(['manager', 'employee'] as const).map(target => (
                  <Button
                    key={target}
                    variant={sendBackTarget === target ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSendBackTarget(target)}
                    className="capitalize"
                  >
                    <User className="h-4 w-4 mr-1" />
                    {target}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                placeholder="Explain why this KPI needs revision..."
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendBackDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendBack}
              disabled={!sendBackReason.trim() || sendBack.isPending}
              variant="destructive"
            >
              <Undo2 className="h-4 w-4 mr-2" />
              Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI Logic Modal */}
      <KpiLogicModal
        isOpen={logicModalOpen}
        onClose={() => setLogicModalOpen(false)}
        kpi={selectedKpi}
      />
    </div>
  );
}

// Helper wrapper that fetches sub-period submissions for Daily KPIs
function DailySubmissionSummaryWrapper({ 
  kpi, 
  selectedPeriod, 
  selectedYear 
}: { 
  kpi: KPI; 
  selectedPeriod: string; 
  selectedYear: number; 
}) {
  const { data: submissions } = useSubPeriodSubmissions(
    kpi.frequency === 'Daily' ? kpi.id : undefined, 
    selectedPeriod, 
    selectedYear
  );
  
  if (kpi.frequency !== 'Daily' || !submissions || submissions.length === 0) {
    return null;
  }
  
  return (
    <DailySubmissionSummary
      kpiId={kpi.id}
      reviewMonth={selectedPeriod}
      reviewYear={selectedYear}
      submissions={submissions}
      uom={kpi.uom}
      uomType={kpi.uom_type}
      qualitativeOptions={kpi.qualitative_options as QualitativeOption[] | null}
    />
  );
}
