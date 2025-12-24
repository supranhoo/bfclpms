import { useState, useMemo } from 'react';
import { useAllKpis, useReviewSubmissions, useRaiseQuery, useSendBackKpi, RatingLevel, KPI } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { useAuth } from '@/contexts/AuthContext';
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
import { RatingSelector, getRatingScore } from '@/components/review/RatingSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Info, 
  Search,
  ArrowUpDown,
  User,
  Target,
  TrendingUp,
  FileCheck,
  ClipboardCheck,
  Eye,
  Undo2,
  MessageSquare,
  Briefcase
} from 'lucide-react';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';

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
  manager_check: 'Pending Audit',
  audit: 'In Audit',
  management_review: 'Management Review',
  approved: 'Approved',
};

const ratingOptions: { value: RatingLevel; label: string; color: string; score: number }[] = [
  { value: 'blue', label: 'Outstanding', color: '#3B82F6', score: 5 },
  { value: 'green', label: 'Exceeds Expectations', color: '#10B981', score: 4 },
  { value: 'yellow', label: 'Meets Expectations', color: '#F59E0B', score: 3 },
  { value: 'red', label: 'Below Expectations', color: '#EF4444', score: 2 },
];

export default function AuditPanel() {
  const { data: allKpis, isLoading } = useAllKpis();
  const { data: categories } = useKraCategories();
  const kpiIds = allKpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();

  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('manager_check');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<NonNullable<typeof allKpis>[number] | null>(null);
  const [auditorRating, setAuditorRating] = useState<RatingLevel | ''>('');
  const [auditorRemarks, setAuditorRemarks] = useState('');

  const openLogicModal = (kpi: NonNullable<typeof allKpis>[number]) => {
    setSelectedKpi(kpi);
    setLogicModalOpen(true);
  };

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  // Period-filtered KPIs for stats
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

  const submitAuditReview = useMutation({
    mutationFn: async ({
      kpi_id,
      auditor_rating,
      auditor_score,
      auditor_remarks,
      approve,
    }: {
      kpi_id: string;
      auditor_rating: RatingLevel;
      auditor_score: number;
      auditor_remarks: string;
      approve: boolean;
    }) => {
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          auditor_rating,
          auditor_score,
          auditor_remarks,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      // Auditor approval moves to management_review, not directly to approved
      const newStatus = approve ? 'management_review' : 'audit';
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ 
        title: variables.approve ? 'Forwarded to Management Review' : 'Audit review saved',
        description: variables.approve ? 'KPI has been sent for management approval' : undefined
      });
      setReviewDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit audit', description: error.message, variant: 'destructive' });
    },
  });

  const openReviewDialog = (kpi: NonNullable<typeof allKpis>[number]) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    setAuditorRating(existing?.auditor_rating || existing?.manager_rating || '');
    setAuditorRemarks(existing?.auditor_remarks || '');
    setReviewDialogOpen(true);
  };

  const openViewDialog = (kpi: NonNullable<typeof allKpis>[number]) => {
    setSelectedKpi(kpi);
    setViewDialogOpen(true);
  };

  const handleSubmitAudit = (approve: boolean) => {
    if (!selectedKpi || !auditorRating) return;
    const score = ratingOptions.find(r => r.value === auditorRating)?.score || 0;
    submitAuditReview.mutate({
      kpi_id: selectedKpi.id,
      auditor_rating: auditorRating,
      auditor_score: score,
      auditor_remarks: auditorRemarks,
      approve,
    });
  };

  // Stats from period-filtered KPIs
  const pendingAudit = periodFilteredKpis?.filter(k => k.status === 'manager_check').length || 0;
  const inAudit = periodFilteredKpis?.filter(k => k.status === 'audit').length || 0;
  const approved = periodFilteredKpis?.filter(k => k.status === 'approved').length || 0;
  const total = pendingAudit + inAudit + approved;
  const completionRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit Panel</h1>
            <p className="text-muted-foreground">Review and approve performance evaluations</p>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full -mr-10 -mt-10" />
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Pending Audit</p>
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{pendingAudit}</p>
                <p className="text-xs text-muted-foreground">Awaiting your review</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full -mr-10 -mt-10" />
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">In Audit</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{inAudit}</p>
                <p className="text-xs text-muted-foreground">Currently reviewing</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <FileCheck className="h-5 w-5 text-purple-500" />
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

      {/* Filters Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee, KRA, or KPI..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Tabs */}
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="flex-1">
              <TabsList className="grid w-full grid-cols-3 max-w-md">
                <TabsTrigger value="manager_check" className="gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="hidden sm:inline">Pending</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {pendingAudit}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="audit" className="gap-2">
                  <FileCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">In Audit</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {inAudit}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="approved" className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Approved</span>
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                KPIs for Audit
              </CardTitle>
              <CardDescription>{filteredKpis?.length || 0} KPIs found</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      Employee
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold">Category</TableHead>
                  <TableHead className="font-semibold">KRA / KPI</TableHead>
                  <TableHead className="font-semibold text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Target className="h-4 w-4" />
                      Target
                    </div>
                  </TableHead>
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
                            className="w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 ring-offset-background"
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
                          {kpi.status === 'manager_check' && !isNaKpi && (
                            <Button size="sm" onClick={() => openReviewDialog(kpi)} className="gap-1.5">
                              <ClipboardCheck className="h-4 w-4" />
                              Audit
                            </Button>
                          )}
                          {kpi.status === 'approved' && (
                            <Button size="sm" variant="outline" onClick={() => openViewDialog(kpi)} className="gap-1.5">
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
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
                        <p className="text-xs">Try adjusting your search or filter criteria</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Audit Review Dialog - Enhanced */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <DialogTitle>Audit Review</DialogTitle>
                <DialogDescription>
                  {(selectedKpi?.profiles as any)?.full_name} - {(selectedKpi?.profiles as any)?.employee_code}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Full KPI Details */}
            {selectedKpi && (
              <ReviewDetailsCard kpi={selectedKpi as unknown as KPI} />
            )}

            {/* Complete Review Trail */}
            {selectedKpi && (
              <ReviewTrailCard 
                submission={submissionMap.get(selectedKpi.id)}
                achievedValue={selectedKpi.target_value}
                showSelf={true}
                showManager={true}
              />
            )}

            {/* Auditor Input */}
            <Card className="border-purple-200 dark:border-purple-800">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <Shield className="h-3.5 w-3.5 text-purple-500" />
                  </div>
                  <p className="text-sm font-medium">Your Audit Review</p>
                </div>

                <RatingSelector
                  value={auditorRating}
                  onChange={setAuditorRating}
                  label="Auditor Rating"
                />

                <div className="space-y-2">
                  <Label>Audit Remarks</Label>
                  <Textarea
                    value={auditorRemarks}
                    onChange={(e) => setAuditorRemarks(e.target.value)}
                    placeholder="Enter your audit observations and remarks..."
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSubmitAudit(false)}
              disabled={!auditorRating || submitAuditReview.isPending}
            >
              Save Draft
            </Button>
            <Button
              onClick={() => handleSubmitAudit(true)}
              disabled={!auditorRating || submitAuditReview.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Forward to Management
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog for Approved KPIs */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <DialogTitle>Approved Review</DialogTitle>
                <DialogDescription>
                  {(selectedKpi?.profiles as any)?.full_name} - {selectedKpi?.kpi_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Self Rating</p>
                  <Badge style={{ backgroundColor: getRatingColor(submissionMap.get(selectedKpi?.id || '')?.self_rating) }} className="text-white">
                    {getRatingLabel(submissionMap.get(selectedKpi?.id || '')?.self_rating)}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Manager Rating</p>
                  <Badge style={{ backgroundColor: getRatingColor(submissionMap.get(selectedKpi?.id || '')?.manager_rating) }} className="text-white">
                    {getRatingLabel(submissionMap.get(selectedKpi?.id || '')?.manager_rating)}
                  </Badge>
                </CardContent>
              </Card>
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Final Rating</p>
                  <Badge style={{ backgroundColor: getRatingColor(submissionMap.get(selectedKpi?.id || '')?.final_rating) }} className="text-white">
                    {getRatingLabel(submissionMap.get(selectedKpi?.id || '')?.final_rating)}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Auditor Remarks</p>
              <p className="text-sm">{submissionMap.get(selectedKpi?.id || '')?.auditor_remarks || 'No remarks provided'}</p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI Logic Modal */}
      <KpiLogicModal
        isOpen={logicModalOpen}
        onClose={() => setLogicModalOpen(false)}
        kpi={selectedKpi as KPI | null}
      />
    </div>
  );
}
