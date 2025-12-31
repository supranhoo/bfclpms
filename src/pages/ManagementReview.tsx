import { useAuth } from '@/contexts/AuthContext';
import { useKraCategories } from '@/hooks/useOrganization';
import { useReviewPageState } from '@/hooks/useReviewPageState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewDetailsCard } from '@/components/review/ReviewDetailsCard';
import { ReviewTrailCard } from '@/components/review/ReviewTrailCard';
import { scoreToRating } from '@/components/review/ScoreSelector';
import { AchievedValueScoreInput } from '@/components/review/AchievedValueScoreInput';
import { ReviewPageHeader } from '@/components/review/ReviewPageHeader';
import { ReviewStatsCards, StatCardConfig } from '@/components/review/ReviewStatsCards';
import { ReviewFilters } from '@/components/review/ReviewFilters';
import { SendBackDialog } from '@/components/review/SendBackDialog';
import { statusColors, statusLabels, ratingOptions } from '@/lib/reviewConstants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  Info, 
  User,
  TrendingUp,
  ClipboardCheck,
} from 'lucide-react';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { RatingLevel } from '@/hooks/useKpis';

export default function ManagementReview() {
  const { user } = useAuth();
  const { data: categories } = useKraCategories();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    selectedPeriod,
    setSelectedPeriod,
    selectedYear,
    setSelectedYear,
    selectedCategory,
    setSelectedCategory,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    reviewDialogOpen,
    setReviewDialogOpen,
    sendBackDialogOpen,
    setSendBackDialogOpen,
    logicModalOpen,
    setLogicModalOpen,
    selectedKpi,
    score,
    setScore,
    remarks,
    setRemarks,
    evidenceUrl,
    setEvidenceUrl,
    achievedValue,
    setAchievedValue,
    sendBackReason,
    setSendBackReason,
    sendBackTarget,
    setSendBackTarget,
    isLoading,
    periodFilteredKpis,
    filteredKpis,
    submissionMap,
    queryMap,
    openReviewDialog,
    openSendBackDialog,
    openLogicModal,
  } = useReviewPageState({
    defaultStatusFilter: 'management_review',
    defaultSendBackTarget: 'auditor',
  });

  const submitManagementReview = useMutation({
    mutationFn: async ({
      kpi_id,
      management_rating,
      management_score,
      management_remarks,
      management_evidence_url,
      approve,
    }: {
      kpi_id: string;
      management_rating: RatingLevel;
      management_score: number;
      management_remarks: string;
      management_evidence_url?: string | null;
      approve: boolean;
    }) => {
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          management_rating,
          management_score,
          management_remarks,
          management_evidence_url,
          final_rating: management_rating,
          final_score: management_score,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      const newStatus = approve ? 'approved' : 'management_review';
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: approve ? 'MANAGEMENT_APPROVED' : 'MANAGEMENT_REVIEWED',
          performed_by: user.id,
          new_value: { management_rating, management_score, management_remarks },
          metadata: { approved_at: approve ? new Date().toISOString() : null },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'Management review submitted successfully' });
      setReviewDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' });
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
        auditor: 'audit',
        manager: 'manager_check', 
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
          management_rating: null,
          management_score: null,
          management_remarks: null,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: `MANAGEMENT_SENT_BACK_TO_${target.toUpperCase()}`,
          performed_by: user.id,
          new_value: { reason, target },
          metadata: { sent_back_at: new Date().toISOString() },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'KPI sent back successfully' });
      setSendBackDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send back', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmitReview = (approve: boolean) => {
    if (!selectedKpi || score === null) return;
    const rating = scoreToRating(score);
    submitManagementReview.mutate({
      kpi_id: selectedKpi.id,
      management_rating: rating,
      management_score: score,
      management_remarks: remarks,
      management_evidence_url: evidenceUrl,
      approve,
    });
  };

  const handleSendBack = () => {
    if (!selectedKpi || !sendBackReason.trim()) return;
    sendBack.mutate({
      kpi_id: selectedKpi.id,
      target: sendBackTarget,
      reason: sendBackReason,
    });
  };

  // Stats
  const pendingReview = periodFilteredKpis?.filter(k => k.status === 'management_review').length || 0;
  const approved = periodFilteredKpis?.filter(k => k.status === 'approved').length || 0;
  const total = pendingReview + approved;
  const completionRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const statsConfig: StatCardConfig[] = [
    { label: 'Pending Review', value: pendingReview, description: 'Awaiting your approval', icon: Clock, color: 'emerald' },
    { label: 'Approved', value: approved, description: 'Fully completed', icon: CheckCircle2, color: 'green' },
    { label: 'Completion Rate', value: completionRate, description: '', icon: TrendingUp, color: 'blue', showProgress: true, progressValue: completionRate },
  ];

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-6">
      <ReviewPageHeader
        title="Management Review"
        description="Final review and approval of performance evaluations"
        icon={Briefcase}
        iconGradient="bg-gradient-to-br from-emerald-500 to-teal-600"
        selectedPeriod={selectedPeriod}
        selectedYear={selectedYear}
        onPeriodChange={setSelectedPeriod}
        onYearChange={setSelectedYear}
      />

      <ReviewStatsCards stats={statsConfig} />

      <ReviewFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        tabs={[
          { value: 'management_review', label: 'Pending', icon: Clock, count: pendingReview },
          { value: 'approved', label: 'Approved', icon: CheckCircle2, count: approved },
        ]}
        activeTab={statusFilter}
        onTabChange={setStatusFilter}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />

      {/* KPIs Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
            KPIs for Management Review
          </CardTitle>
          <CardDescription>{filteredKpis?.length || 0} KPIs found</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>KRA / KPI</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Achieved</TableHead>
                <TableHead>Auditor Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKpis?.map(kpi => {
                const submission = submissionMap.get(kpi.id);
                const employee = kpi.profiles as any;
                
                return (
                  <TableRow key={kpi.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{employee?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{employee?.employee_code || '-'}</p>
                        </div>
                      </div>
                    </TableCell>
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
                        onClick={() => openLogicModal(kpi)}
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
                    <TableCell>{submission?.achieved_value ?? '-'}</TableCell>
                    <TableCell>
                      {submission?.auditor_rating ? (
                        <Badge
                          style={{
                            backgroundColor: ratingOptions.find(r => r.value === submission.auditor_rating)?.color,
                          }}
                          className="text-white"
                        >
                          {ratingOptions.find(r => r.value === submission.auditor_rating)?.label}
                        </Badge>
                      ) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[kpi.status || 'kra_set']}>
                        {statusLabels[kpi.status || 'kra_set']}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {kpi.status === 'management_review' && (
                          <>
                            <Button 
                              size="sm" 
                              onClick={() => openReviewDialog(kpi, 'management', 'auditor')}
                            >
                              Review
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => openSendBackDialog(kpi, 'auditor')}
                            >
                              Send Back
                            </Button>
                          </>
                        )}
                        {kpi.status === 'approved' && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredKpis?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No KPIs found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Management Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-emerald-500" />
              Management Review
            </DialogTitle>
            <DialogDescription>
              Final review and approval of KPI evaluation
            </DialogDescription>
          </DialogHeader>

          {selectedKpi && (
            <div className="space-y-6">
              <ReviewDetailsCard kpi={selectedKpi} />
              
              <ReviewTrailCard
                submission={submissionMap.get(selectedKpi.id)}
                achievedValue={submissionMap.get(selectedKpi.id)?.achieved_value}
                showSelf
                showManager
                showAuditor
              />

              <div className="space-y-4 border-t pt-4">
                <h4 className="font-medium">Management Assessment</h4>
                
                <AchievedValueScoreInput
                  kpi={selectedKpi}
                  achievedValue={achievedValue}
                  onAchievedValueChange={setAchievedValue}
                  score={score}
                  onScoreChange={setScore}
                />

                <div className="space-y-2">
                  <Label>Management Remarks</Label>
                  <Textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Enter your management remarks..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Evidence URL</Label>
                  <input
                    type="url"
                    value={evidenceUrl || ''}
                    onChange={(e) => setEvidenceUrl(e.target.value || null)}
                    placeholder="https://..."
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="secondary"
              onClick={() => handleSubmitReview(false)}
              disabled={score === null}
            >
              Save Draft
            </Button>
            <Button 
              onClick={() => handleSubmitReview(true)}
              disabled={score === null}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Back Dialog */}
      <SendBackDialog
        open={sendBackDialogOpen}
        onOpenChange={setSendBackDialogOpen}
        kpi={selectedKpi}
        reason={sendBackReason}
        onReasonChange={setSendBackReason}
        target={sendBackTarget}
        onTargetChange={setSendBackTarget}
        targets={[
          { value: 'auditor', label: 'Send to Auditor' },
          { value: 'manager', label: 'Send to Manager' },
          { value: 'employee', label: 'Send to Employee' },
        ]}
        onSubmit={handleSendBack}
        isLoading={sendBack.isPending}
      />

      {/* KPI Logic Modal */}
      <KpiLogicModal
        isOpen={logicModalOpen}
        onClose={() => setLogicModalOpen(false)}
        kpi={selectedKpi}
      />
    </div>
  );
}
