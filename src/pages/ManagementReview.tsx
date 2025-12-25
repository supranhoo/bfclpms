import { useState, useMemo } from 'react';
import { useAllKpis, useReviewSubmissions, useKpiQueries, RatingLevel, KPI } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { ReviewDetailsCard } from '@/components/review/ReviewDetailsCard';
import { ReviewTrailCard, getRatingColor, getRatingLabel } from '@/components/review/ReviewTrailCard';
import { ScoreSelector, scoreToRating } from '@/components/review/ScoreSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  Info, 
  Search,
  User,
  Target,
  TrendingUp,
  ClipboardCheck,
  Undo2,
  Shield
} from 'lucide-react';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
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

export default function ManagementReview() {
  const { user } = useAuth();
  const { data: allKpis, isLoading } = useAllKpis();
  const { data: categories } = useKraCategories();
  const kpiIds = allKpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const { data: queries } = useKpiQueries(kpiIds);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();

  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('management_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [sendBackDialogOpen, setSendBackDialogOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<NonNullable<typeof allKpis>[number] | null>(null);
  const [managementScore, setManagementScore] = useState<number | null>(null);
  const [managementRating, setManagementRating] = useState<RatingLevel | ''>('');
  const [managementRemarks, setManagementRemarks] = useState('');
  const [sendBackReason, setSendBackReason] = useState('');
  const [sendBackTarget, setSendBackTarget] = useState<'auditor' | 'manager' | 'employee'>('auditor');
  const [managementEvidenceUrl, setManagementEvidenceUrl] = useState<string | null>(null);

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  // Build query map
  const queryMap = new Map<string, typeof queries>();
  queries?.forEach(q => {
    const existing = queryMap.get(q.kpi_id) || [];
    queryMap.set(q.kpi_id, [...existing, q]);
  });

  // Period-filtered KPIs
  const periodFilteredKpis = useMemo(() => {
    let filtered = allKpis || [];
    filtered = filtered.filter(kpi => {
      const periodMatch = kpi.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
      const yearMatch = kpi.review_year === selectedYear;
      return periodMatch && yearMatch;
    });
    return filtered;
  }, [allKpis, selectedPeriod, selectedYear]);

  const filteredKpis = useMemo(() => {
    let filtered = periodFilteredKpis;
    
    if (selectedCategory) {
      filtered = filtered.filter(kpi => kpi.category_id === selectedCategory);
    }
    if (statusFilter) {
      filtered = filtered.filter(kpi => kpi.status === statusFilter);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(kpi => {
        const employee = kpi.profiles as any;
        return (
          kpi.kpi_name?.toLowerCase().includes(query) ||
          kpi.kra_name?.toLowerCase().includes(query) ||
          employee?.full_name?.toLowerCase().includes(query) ||
          employee?.employee_code?.toLowerCase().includes(query)
        );
      });
    }
    return filtered;
  }, [periodFilteredKpis, selectedCategory, statusFilter, searchQuery]);

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

      // Log the action
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
      target: 'auditor' | 'manager' | 'employee';
      reason: string;
    }) => {
      const statusMap = {
        auditor: 'audit',
        manager: 'manager_check', 
        employee: 'kra_set',
      };

      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: statusMap[target] as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      // Reset management fields if sending back
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          management_rating: null,
          management_score: null,
          management_remarks: null,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      // Log the action
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

  const openReviewDialog = (kpi: NonNullable<typeof allKpis>[number]) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    setManagementScore(existing?.management_score || existing?.auditor_score || null);
    setManagementRating(existing?.management_rating || existing?.auditor_rating || '');
    setManagementRemarks(existing?.management_remarks || '');
    setManagementEvidenceUrl(existing?.management_evidence_url || null);
    setReviewDialogOpen(true);
  };

  const openSendBackDialog = (kpi: NonNullable<typeof allKpis>[number]) => {
    setSelectedKpi(kpi);
    setSendBackReason('');
    setSendBackTarget('auditor');
    setSendBackDialogOpen(true);
  };

  const openLogicModal = (kpi: NonNullable<typeof allKpis>[number]) => {
    setSelectedKpi(kpi);
    setLogicModalOpen(true);
  };

  const handleSubmitReview = (approve: boolean) => {
    if (!selectedKpi || managementScore === null) return;
    const rating = scoreToRating(managementScore);
    submitManagementReview.mutate({
      kpi_id: selectedKpi.id,
      management_rating: rating,
      management_score: managementScore,
      management_remarks: managementRemarks,
      management_evidence_url: managementEvidenceUrl,
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

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
            <Briefcase className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Management Review</h1>
            <p className="text-muted-foreground">Final review and approval of performance evaluations</p>
          </div>
        </div>
        <ReviewPeriodSelector
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          onPeriodChange={setSelectedPeriod}
          onYearChange={setSelectedYear}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full -mr-10 -mt-10" />
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{pendingReview}</p>
                <p className="text-xs text-muted-foreground">Awaiting your approval</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full -mr-10 -mt-10" />
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{approved}</p>
                <p className="text-xs text-muted-foreground">Fully completed</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10" />
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Completion Rate</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{completionRate}%</p>
                <Progress value={completionRate} className="h-1.5 mt-2" />
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee, KRA, or KPI..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="flex-1">
              <TabsList className="grid w-full grid-cols-2 max-w-xs">
                <TabsTrigger value="management_review" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Pending
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {pendingReview}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="approved" className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Approved
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {approved}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="h-8"
            >
              All Categories
            </Button>
            {categories?.map(cat => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className="h-8"
              >
                <div
                  className="w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: cat.color }}
                />
                {cat.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

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
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Employee</TableHead>
                  <TableHead className="font-semibold">Category</TableHead>
                  <TableHead className="font-semibold">KRA / KPI</TableHead>
                  <TableHead className="font-semibold text-center">Target</TableHead>
                  <TableHead className="font-semibold text-center">Achieved</TableHead>
                  <TableHead className="font-semibold text-center">Self</TableHead>
                  <TableHead className="font-semibold text-center">Manager</TableHead>
                  <TableHead className="font-semibold text-center">Auditor</TableHead>
                  <TableHead className="font-semibold text-center">Status</TableHead>
                  <TableHead className="font-semibold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKpis?.map(kpi => {
                  const submission = submissionMap.get(kpi.id);
                  const employee = kpi.profiles as any;
                  const isNaKpi = submission?.is_na || false;
                  
                  return (
                    <TableRow 
                      key={kpi.id}
                      className={`hover:bg-muted/30 transition-colors ${isNaKpi ? 'opacity-60 bg-muted/10' : ''}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {employee?.full_name?.charAt(0) || 'U'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-sm">{employee?.full_name || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">{employee?.employee_code}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: kpi.kra_categories?.color }}
                          />
                          <span className="text-sm">{kpi.kra_categories?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => openLogicModal(kpi)}
                          className="text-left hover:bg-muted/50 p-1.5 -m-1.5 rounded-lg transition-colors cursor-pointer group max-w-xs"
                          title="Click to view KPI details"
                        >
                          <p className="font-medium text-primary group-hover:underline text-sm">{kpi.kra_name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1">
                            {kpi.kpi_name}
                            <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </p>
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm">{kpi.target_value ?? '-'}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {isNaKpi ? (
                          <Badge variant="outline" className="bg-muted/50">N/A</Badge>
                        ) : (
                          <span className="font-mono text-sm">{submission?.achieved_value ?? '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isNaKpi ? (
                          <Badge variant="outline" className="bg-muted/50">N/A</Badge>
                        ) : submission?.self_rating ? (
                          <Badge
                            style={{ backgroundColor: getRatingColor(submission.self_rating) }}
                            className="text-white font-medium"
                          >
                            {submission.self_score}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isNaKpi ? (
                          <Badge variant="outline" className="bg-muted/50">N/A</Badge>
                        ) : submission?.manager_rating ? (
                          <Badge
                            style={{ backgroundColor: getRatingColor(submission.manager_rating) }}
                            className="text-white font-medium"
                          >
                            {submission.manager_score}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isNaKpi ? (
                          <Badge variant="outline" className="bg-muted/50">N/A</Badge>
                        ) : submission?.auditor_rating ? (
                          <Badge
                            style={{ backgroundColor: getRatingColor(submission.auditor_rating) }}
                            className="text-white font-medium"
                          >
                            {submission.auditor_score}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={statusColors[kpi.status || 'kra_set']}>
                          {statusLabels[kpi.status || 'kra_set']}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {kpi.status === 'management_review' && !isNaKpi && (
                            <>
                              <Button size="sm" onClick={() => openReviewDialog(kpi)} className="gap-1.5">
                                <ClipboardCheck className="h-4 w-4" />
                                Review
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => openSendBackDialog(kpi)}
                                className="text-orange-600"
                              >
                                <Undo2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {kpi.status === 'approved' && (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          )}
                          {isNaKpi && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Not Applicable
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!filteredKpis || filteredKpis.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ClipboardCheck className="h-8 w-8 opacity-50" />
                        <p>No KPIs found matching the filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Management Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <DialogTitle>Management Review</DialogTitle>
                <DialogDescription>
                  {(selectedKpi?.profiles as any)?.full_name} - {(selectedKpi?.profiles as any)?.employee_code}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* KPI Details */}
            {selectedKpi && (
              <ReviewDetailsCard kpi={selectedKpi as unknown as KPI} />
            )}

            {/* Complete Review Trail with Queries */}
            {selectedKpi && (
              <ReviewTrailCard 
                submission={submissionMap.get(selectedKpi.id)}
                achievedValue={selectedKpi.target_value}
                showSelf={true}
                showManager={true}
                showAuditor={true}
                queries={queryMap.get(selectedKpi.id) || []}
              />
            )}

            {/* Management Input */}
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium">Your Management Review</p>
                </div>

                <ScoreSelector
                  value={managementScore}
                  onChange={(score, rating) => {
                    setManagementScore(score);
                    setManagementRating(rating);
                  }}
                  label="Final Score"
                />

                <div className="space-y-2">
                  <Label>Justification & Remarks</Label>
                  <Textarea
                    value={managementRemarks}
                    onChange={(e) => setManagementRemarks(e.target.value)}
                    placeholder="Provide justification for your final score and any observations..."
                    rows={3}
                    className="resize-none"
                  />
                </div>

                {/* Evidence Upload for Management */}
                {user && selectedKpi && (
                  <EvidenceUpload
                    userId={user.id}
                    kpiId={selectedKpi.id}
                    existingUrl={managementEvidenceUrl}
                    onUploadComplete={(url) => setManagementEvidenceUrl(url || null)}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSubmitReview(false)}
              disabled={managementScore === null || submitManagementReview.isPending}
            >
              Save Draft
            </Button>
            <Button
              onClick={() => handleSubmitReview(true)}
              disabled={managementScore === null || submitManagementReview.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Back Dialog */}
      <Dialog open={sendBackDialogOpen} onOpenChange={setSendBackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back for Revision</DialogTitle>
            <DialogDescription>
              Send "{selectedKpi?.kpi_name}" back for revision
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Send Back To</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'auditor', label: 'Auditor', icon: Shield },
                  { value: 'manager', label: 'Manager', icon: Briefcase },
                  { value: 'employee', label: 'Employee', icon: User },
                ].map(opt => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={sendBackTarget === opt.value ? 'default' : 'outline'}
                    onClick={() => setSendBackTarget(opt.value as any)}
                    className="h-auto py-3 flex flex-col gap-1"
                  >
                    <opt.icon className="h-4 w-4" />
                    <span className="text-xs">{opt.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason for Sending Back <span className="text-destructive">*</span></Label>
              <Textarea
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                placeholder="Explain why this needs to be revised..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendBackDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSendBack} 
              disabled={!sendBackReason.trim() || sendBack.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              {sendBack.isPending ? 'Sending...' : 'Send Back'}
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
