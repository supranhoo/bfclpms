import { useAuth } from '@/contexts/AuthContext';
import { useKraCategories } from '@/hooks/useOrganization';
import { useReviewPageState } from '@/hooks/useReviewPageState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
  Shield,
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

      {/* Management Review Sheet - Compact No-Scroll Layout */}
      <Sheet open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <SheetContent size="full" className="flex flex-col h-full p-4">
          {/* Compact Header */}
          <SheetHeader className="pb-3 border-b flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="flex-1">
                <SheetTitle className="text-lg">Management Review</SheetTitle>
                <SheetDescription className="text-sm">
                  Final review and approval
                </SheetDescription>
              </div>
              <Badge variant="outline">{selectedKpi?.kra_name}</Badge>
            </div>
          </SheetHeader>

          {/* Main Content - Grid Layout */}
          <div className="flex-1 grid grid-cols-12 gap-4 py-4 min-h-0">
            {/* Left Section - KPI Details & Review Trail (5 cols) */}
            <div className="col-span-5 space-y-3 overflow-hidden">
              {/* KPI Details - Compact */}
              {selectedKpi && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-primary truncate">{selectedKpi.kpi_name}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
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
                </div>
              )}

              {/* Previous Reviews - Compact 3-column */}
              {selectedKpi && submissionMap.get(selectedKpi.id) && (
                <div className="grid grid-cols-3 gap-2">
                  {/* Self Review */}
                  <div className="p-2 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="h-4 w-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <User className="h-2.5 w-2.5 text-blue-500" />
                      </div>
                      <span className="text-xs font-medium">Self</span>
                      {submissionMap.get(selectedKpi.id)?.self_score && (
                        <Badge variant="outline" className="ml-auto text-xs px-1 py-0">
                          {submissionMap.get(selectedKpi.id)?.self_score}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {submissionMap.get(selectedKpi.id)?.self_remarks || 'No remarks'}
                    </p>
                  </div>
                  {/* Manager Review */}
                  <div className="p-2 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="h-4 w-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Briefcase className="h-2.5 w-2.5 text-amber-500" />
                      </div>
                      <span className="text-xs font-medium">Mgr</span>
                      {submissionMap.get(selectedKpi.id)?.manager_score && (
                        <Badge variant="outline" className="ml-auto text-xs px-1 py-0">
                          {submissionMap.get(selectedKpi.id)?.manager_score}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {submissionMap.get(selectedKpi.id)?.manager_remarks || 'No remarks'}
                    </p>
                  </div>
                  {/* Auditor Review */}
                  <div className="p-2 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="h-4 w-4 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <Shield className="h-2.5 w-2.5 text-purple-500" />
                      </div>
                      <span className="text-xs font-medium">Audit</span>
                      {submissionMap.get(selectedKpi.id)?.auditor_score && (
                        <Badge variant="outline" className="ml-auto text-xs px-1 py-0">
                          {submissionMap.get(selectedKpi.id)?.auditor_score}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {submissionMap.get(selectedKpi.id)?.auditor_remarks || 'No remarks'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Section - Management Input (7 cols) */}
            <div className="col-span-7 flex flex-col gap-3">
              <div className="p-3 border border-emerald-200 dark:border-emerald-800 rounded-lg flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Briefcase className="h-3 w-3 text-emerald-500" />
                  </div>
                  <span className="text-sm font-medium">Management Assessment</span>
                </div>

                <div className="grid grid-cols-2 gap-4 flex-1">
                  {/* Left - Score Input */}
                  <div className="space-y-3">
                    {selectedKpi && (
                      <AchievedValueScoreInput
                        kpi={selectedKpi}
                        achievedValue={achievedValue}
                        onAchievedValueChange={setAchievedValue}
                        score={score}
                        onScoreChange={setScore}
                      />
                    )}
                    {/* Evidence URL */}
                    <div className="space-y-1">
                      <Label className="text-xs">Evidence URL</Label>
                      <input
                        type="url"
                        value={evidenceUrl || ''}
                        onChange={(e) => setEvidenceUrl(e.target.value || null)}
                        placeholder="https://..."
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                      />
                    </div>
                  </div>

                  {/* Right - Remarks */}
                  <div className="flex flex-col">
                    <Label className="text-sm mb-2">Management Remarks</Label>
                    <Textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Enter your management remarks..."
                      className="flex-1 resize-none min-h-[100px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <SheetFooter className="pt-3 border-t flex-shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="secondary"
              size="sm"
              onClick={() => handleSubmitReview(false)}
              disabled={score === null}
            >
              Save Draft
            </Button>
            <Button 
              size="sm"
              onClick={() => handleSubmitReview(true)}
              disabled={score === null}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
