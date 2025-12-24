import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers, useProfiles } from '@/hooks/useOrganization';
import { useKpisByEmployee, useReviewSubmissions, useRolloverKpi, useApproveKpi, useRaiseQuery, useKpiQueries, useSendBackKpi, RatingLevel, KPI, KpiStatus } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { ReviewDetailsCard } from '@/components/review/ReviewDetailsCard';
import { ReviewTrailCard } from '@/components/review/ReviewTrailCard';
import { RatingSelector, getRatingScore } from '@/components/review/RatingSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, CheckCircle2, Clock, ArrowRight, Search, RefreshCw, MessageSquare, Check, Lock, Info, User, Undo2, Briefcase } from 'lucide-react';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';

const reviewPeriods = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
  'Q1', 'Q2', 'Q3', 'Q4'
];

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  management_review: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  audit: 'Audit',
  management_review: 'Management Review',
  approved: 'Approved',
};

const kpiStatusColors: Record<KpiStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved_by_manager: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  locked: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  sent_back: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const kpiStatusLabels: Record<KpiStatus, string> = {
  open: 'Open',
  submitted: 'Submitted',
  approved_by_manager: 'Approved',
  locked: 'Locked',
  sent_back: 'Sent Back',
};

const ratingOptions: { value: RatingLevel; label: string; color: string }[] = [
  { value: 'red', label: 'Below Expectations', color: '#EF4444' },
  { value: 'yellow', label: 'Meets Expectations', color: '#F59E0B' },
  { value: 'green', label: 'Exceeds Expectations', color: '#10B981' },
  { value: 'blue', label: 'Outstanding', color: '#3B82F6' },
];

function TeamMemberKpis({ memberId, memberName, selectedPeriod, selectedYear }: { memberId: string; memberName: string; selectedPeriod: string; selectedYear: number }) {
  const { data: allKpis, isLoading } = useKpisByEmployee(memberId);
  
  // Filter KPIs by period and year - ensure proper string comparison
  const kpis = allKpis?.filter(k => {
    const periodMatch = k.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
    const yearMatch = k.review_year === selectedYear;
    return periodMatch && yearMatch;
  });
  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const { data: queries } = useKpiQueries(kpiIds);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [queryDialogOpen, setQueryDialogOpen] = useState(false);
  const [sendBackDialogOpen, setSendBackDialogOpen] = useState(false);
  const [rolloverDialogOpen, setRolloverDialogOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  const [managerRating, setManagerRating] = useState<RatingLevel | ''>('');
  const [managerRemarks, setManagerRemarks] = useState('');
  const [queryReason, setQueryReason] = useState('');
  const [sendBackReason, setSendBackReason] = useState('');
  const [targetPeriod, setTargetPeriod] = useState('');

  const openLogicModal = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setLogicModalOpen(true);
  };
  
  const rolloverKpi = useRolloverKpi();
  const approveKpi = useApproveKpi();
  const raiseQuery = useRaiseQuery();
  const sendBackKpi = useSendBackKpi();
  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));
  const queryMap = new Map<string, typeof queries>();
  queries?.forEach(q => {
    const existing = queryMap.get(q.kpi_id) || [];
    queryMap.set(q.kpi_id, [...existing, q]);
  });

  const submitManagerReview = useMutation({
    mutationFn: async ({
      kpi_id,
      manager_rating,
      manager_score,
      manager_remarks,
    }: {
      kpi_id: string;
      manager_rating: RatingLevel;
      manager_score: number;
      manager_remarks: string;
    }) => {
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          manager_rating,
          manager_score,
          manager_remarks,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: 'manager_check' as const })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'Manager review submitted' });
      setReviewDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' });
    },
  });

  const openReviewDialog = (kpi: NonNullable<typeof kpis>[number]) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    setManagerRating(existing?.manager_rating || '');
    setManagerRemarks(existing?.manager_remarks || '');
    setReviewDialogOpen(true);
  };

  const openQueryDialog = (kpi: NonNullable<typeof kpis>[number]) => {
    setSelectedKpi(kpi);
    setQueryReason('');
    setQueryDialogOpen(true);
  };

  const handleApproveKpi = () => {
    if (!selectedKpi || !managerRating) return;
    const score = managerRating === 'blue' ? 100 : managerRating === 'green' ? 80 : managerRating === 'yellow' ? 60 : 40;
    approveKpi.mutate({
      kpi_id: selectedKpi.id,
      manager_rating: managerRating,
      manager_score: score,
      manager_remarks: managerRemarks,
    }, {
      onSuccess: () => setReviewDialogOpen(false),
    });
  };

  const handleRaiseQuery = () => {
    if (!selectedKpi || !queryReason.trim()) return;
    raiseQuery.mutate({
      kpi_id: selectedKpi.id,
      raised_to: memberId,
      reason: queryReason,
      entity_type: 'kpi',
    }, {
      onSuccess: () => setQueryDialogOpen(false),
    });
  };

  const openSendBackDialog = (kpi: NonNullable<typeof kpis>[number]) => {
    setSelectedKpi(kpi);
    setSendBackReason('');
    setSendBackDialogOpen(true);
  };

  const handleSendBack = () => {
    if (!selectedKpi || !sendBackReason.trim()) return;
    sendBackKpi.mutate({
      kpi_id: selectedKpi.id,
      employee_id: memberId,
      reason: sendBackReason,
    }, {
      onSuccess: () => setSendBackDialogOpen(false),
    });
  };

  const handleSubmitReview = () => {
    if (!selectedKpi || !managerRating) return;
    const score = managerRating === 'blue' ? 100 : managerRating === 'green' ? 80 : managerRating === 'yellow' ? 60 : 40;
    submitManagerReview.mutate({
      kpi_id: selectedKpi.id,
      manager_rating: managerRating,
      manager_score: score,
      manager_remarks: managerRemarks,
    });
  };

  const openRolloverDialog = (kpi: NonNullable<typeof kpis>[number]) => {
    setSelectedKpi(kpi);
    // Set default target period to next month
    const currentPeriod = kpi.review_period || '';
    const currentIndex = reviewPeriods.indexOf(currentPeriod);
    if (currentIndex !== -1 && currentIndex < 11) {
      setTargetPeriod(reviewPeriods[currentIndex + 1]);
    } else if (currentPeriod === 'December') {
      setTargetPeriod('January');
    } else {
      setTargetPeriod('');
    }
    setRolloverDialogOpen(true);
  };

  const handleRollover = () => {
    if (!selectedKpi || !targetPeriod) return;
    rolloverKpi.mutate(
      { kpi: selectedKpi as KPI, targetPeriod },
      { onSuccess: () => setRolloverDialogOpen(false) }
    );
  };

  const pendingReviewKpis = kpis?.filter(k => k.status === 'self_review') || [];
  const reviewedKpis = kpis?.filter(k => k.status === 'manager_check' || k.status === 'audit' || k.status === 'approved') || [];

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{memberName}'s KPIs</h3>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            {pendingReviewKpis.length} pending review
          </Badge>
          <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            {reviewedKpis.length} reviewed
          </Badge>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>KRA / KPI</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Achieved</TableHead>
            <TableHead>Self Rating</TableHead>
            <TableHead>Manager Rating</TableHead>
            <TableHead>KPI Status</TableHead>
            <TableHead>Queries</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {kpis?.map(kpi => {
            const submission = submissionMap.get(kpi.id);
            const kpiQueries = queryMap.get(kpi.id) || [];
            const openQueries = kpiQueries.filter((q: any) => q.status === 'open');
            const kpiStatus = submission?.kpi_status || 'open';
            const isLocked = kpiStatus === 'locked' || kpiStatus === 'approved_by_manager';
            const isNaKpi = submission?.is_na || false;
            
            return (
              <TableRow 
                key={kpi.id} 
                className={`${isLocked ? 'opacity-75 bg-muted/30' : ''} ${isNaKpi ? 'opacity-60 bg-muted/20' : ''}`}
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
                <TableCell>
                  {isNaKpi ? (
                    <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      N/A
                    </Badge>
                  ) : (
                    submission?.achieved_value ?? '-'
                  )}
                </TableCell>
                <TableCell>
                  {isNaKpi ? (
                    <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      N/A
                    </Badge>
                  ) : submission?.self_rating ? (
                    <Badge
                      style={{
                        backgroundColor: ratingOptions.find(r => r.value === submission.self_rating)?.color,
                      }}
                      className="text-white"
                    >
                      {ratingOptions.find(r => r.value === submission.self_rating)?.label}
                    </Badge>
                  ) : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell>
                  {isNaKpi ? (
                    <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      N/A
                    </Badge>
                  ) : submission?.manager_rating ? (
                    <Badge
                      style={{
                        backgroundColor: ratingOptions.find(r => r.value === submission.manager_rating)?.color,
                      }}
                      className="text-white"
                    >
                      {ratingOptions.find(r => r.value === submission.manager_rating)?.label}
                    </Badge>
                  ) : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    <Badge className={kpiStatusColors[kpiStatus]}>
                      {kpiStatusLabels[kpiStatus]}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  {openQueries.length > 0 ? (
                    <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {openQueries.length} open
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {/* Show approve/query/send-back buttons only for submitted KPIs that aren't locked */}
                    {kpiStatus === 'submitted' && (
                      <>
                        <Button 
                          size="sm" 
                          variant="default"
                          onClick={() => openReviewDialog(kpi)}
                          title="Approve this KPI"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => openQueryDialog(kpi)}
                          title="Raise a query"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => openSendBackDialog(kpi)}
                          title="Send back to employee for revision"
                          className="text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {kpiStatus === 'approved_by_manager' && (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Approved
                      </Badge>
                    )}
                    {kpiStatus === 'open' && (
                      <span className="text-muted-foreground text-xs">Awaiting submission</span>
                    )}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => openRolloverDialog(kpi)}
                      title="Rollover to next period"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => {
                        setSelectedKpi(kpi);
                        setTimelineOpen(true);
                      }}
                      title="View Timeline"
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Approve KPI Dialog - Enhanced */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <DialogTitle>Manager Review</DialogTitle>
                <DialogDescription>
                  Review and approve KPI for {memberName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Full KPI Details */}
            {selectedKpi && (
              <ReviewDetailsCard kpi={selectedKpi} />
            )}

            {/* Self Review Trail */}
            {selectedKpi && (
              <ReviewTrailCard 
                submission={submissionMap.get(selectedKpi.id)}
                achievedValue={selectedKpi.target_value}
                showSelf={true}
                showManager={false}
              />
            )}

            {/* Manager Input */}
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Briefcase className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <p className="text-sm font-medium">Your Manager Review</p>
                </div>

                <RatingSelector
                  value={managerRating}
                  onChange={setManagerRating}
                  label="Manager Rating"
                />

                <div className="space-y-2">
                  <Label>Manager Remarks</Label>
                  <Textarea
                    value={managerRemarks}
                    onChange={(e) => setManagerRemarks(e.target.value)}
                    placeholder="Enter your review remarks and observations..."
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleApproveKpi} 
              disabled={!managerRating || approveKpi.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4 mr-1" />
              {approveKpi.isPending ? 'Approving...' : 'Approve KPI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise Query Dialog */}
      <Dialog open={queryDialogOpen} onOpenChange={setQueryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise Query</DialogTitle>
            <DialogDescription>
              Raise a query for: {selectedKpi?.kpi_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">KRA</Label>
                  <p className="font-medium">{selectedKpi?.kra_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Target</Label>
                  <p className="font-medium">{selectedKpi?.target_value} {selectedKpi?.uom}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Self Rating</Label>
                  <p className="font-medium">{submissionMap.get(selectedKpi?.id || '')?.self_rating || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Achieved</Label>
                  <p className="font-medium">{submissionMap.get(selectedKpi?.id || '')?.achieved_value || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Query Reason <span className="text-destructive">*</span></Label>
              <Textarea
                value={queryReason}
                onChange={(e) => setQueryReason(e.target.value)}
                placeholder="Describe your query or concern about this KPI..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQueryDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleRaiseQuery} 
              disabled={!queryReason.trim() || raiseQuery.isPending}
              variant="destructive"
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              {raiseQuery.isPending ? 'Raising...' : 'Raise Query'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Back Dialog */}
      <Dialog open={sendBackDialogOpen} onOpenChange={setSendBackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back to Employee</DialogTitle>
            <DialogDescription>
              Send "{selectedKpi?.kpi_name}" back to the employee for revision
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                <strong>Note:</strong> This will reset the KPI status and notify the employee to resubmit their self-review.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-muted-foreground">KRA</Label>
                <p className="font-medium">{selectedKpi?.kra_name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Target</Label>
                <p className="font-medium">{selectedKpi?.target_value} {selectedKpi?.uom}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Self Rating</Label>
                <p className="font-medium">{submissionMap.get(selectedKpi?.id || '')?.self_rating || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Achieved</Label>
                <p className="font-medium">{submissionMap.get(selectedKpi?.id || '')?.achieved_value || 'N/A'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason for Sending Back <span className="text-destructive">*</span></Label>
              <Textarea
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                placeholder="Explain why this KPI needs to be revised..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendBackDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSendBack} 
              disabled={!sendBackReason.trim() || sendBackKpi.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              {sendBackKpi.isPending ? 'Sending...' : 'Send Back'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollover Dialog */}
      <Dialog open={rolloverDialogOpen} onOpenChange={setRolloverDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollover KRA to Next Period</DialogTitle>
            <DialogDescription>
              Copy "{selectedKpi?.kra_name}" to a new review period
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-muted-foreground">Current Period</Label>
                <p className="font-medium">{selectedKpi?.review_period || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Current Year</Label>
                <p className="font-medium">{selectedKpi?.review_year || 'N/A'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Period</Label>
              <Select value={targetPeriod} onValueChange={setTargetPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target period" />
                </SelectTrigger>
                <SelectContent>
                  {reviewPeriods.map(period => (
                    <SelectItem key={period} value={period}>
                      {period}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <p>This will create a new KPI with the same settings for the selected period.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRolloverDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRollover} disabled={!targetPeriod || rolloverKpi.isPending}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {rolloverKpi.isPending ? 'Rolling over...' : 'Rollover KRA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timeline Modal */}
      <KpiTimeline
        isOpen={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        kpi={selectedKpi}
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

export default function TeamReview() {
  const { user, role } = useAuth();
  const { data: teamMembers, isLoading: teamLoading } = useTeamMembers(user?.id);
  const { data: allProfiles, isLoading: profilesLoading } = useProfiles();
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  const isAdmin = role === 'admin';
  const isLoading = isAdmin ? profilesLoading : teamLoading;

  // For admin: show all employees with their managers
  // For managers: show only their direct reports
  const displayMembers = isAdmin 
    ? allProfiles?.filter(p => 
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : teamMembers;

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId || !allProfiles) return null;
    return allProfiles.find(p => p.id === managerId)?.full_name || null;
  };

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Review</h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'View all employees and their performance' : "Review and manage your team's performance"}
          </p>
        </div>
        <ReviewPeriodSelector
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          onPeriodChange={setSelectedPeriod}
          onYearChange={setSelectedYear}
        />
      </div>

      {/* Team Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {isAdmin ? 'Total Employees' : 'Team Size'}
                </p>
                <p className="text-3xl font-bold">{displayMembers?.length || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {selectedMember ? '-' : '—'}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-3xl font-bold text-green-600">
                  {selectedMember ? '-' : '—'}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Selected</p>
                <p className="text-3xl font-bold text-blue-600">
                  {selectedMember ? '1' : '0'}
                </p>
                <p className="text-xs text-muted-foreground">member</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search (Admin only) */}
      {isAdmin && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? 'All Employees' : 'Team Members'}</CardTitle>
          <CardDescription>
            {isAdmin 
              ? 'Select an employee to review their KPIs' 
              : 'Select a team member to review their KPIs'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayMembers && displayMembers.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {displayMembers.map(member => {
                const managerName = getManagerName(member.reporting_manager_id);
                return (
                  <Card
                    key={member.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedMember === member.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedMember(member.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{member.full_name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {member.designation || member.email}
                          </p>
                          {isAdmin && managerName && (
                            <p className="text-xs text-muted-foreground truncate">
                              Manager: {managerName}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{isAdmin ? 'No employees found' : 'No team members found'}</p>
              <p className="text-sm">
                {isAdmin 
                  ? 'Try adjusting your search criteria' 
                  : "You don't have any direct reports assigned"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Member KPIs */}
      {selectedMember && (
        <Card>
          <CardHeader>
            <CardTitle>KPI Review</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamMemberKpis
              memberId={selectedMember}
              memberName={displayMembers?.find(m => m.id === selectedMember)?.full_name || 'Team Member'}
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
