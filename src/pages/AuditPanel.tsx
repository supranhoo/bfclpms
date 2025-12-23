import { useState, useMemo } from 'react';
import { useAllKpis, useReviewSubmissions, RatingLevel, KPI } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Shield, CheckCircle2, AlertTriangle, Clock, Info } from 'lucide-react';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';

const statusColors = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  audit: 'Audit',
  approved: 'Approved',
};

const ratingOptions: { value: RatingLevel; label: string; color: string }[] = [
  { value: 'red', label: 'Below Expectations', color: '#EF4444' },
  { value: 'yellow', label: 'Meets Expectations', color: '#F59E0B' },
  { value: 'green', label: 'Exceeds Expectations', color: '#10B981' },
  { value: 'blue', label: 'Outstanding', color: '#3B82F6' },
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
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<NonNullable<typeof allKpis>[number] | null>(null);
  const [auditorRating, setAuditorRating] = useState<RatingLevel | ''>('');
  const [auditorRemarks, setAuditorRemarks] = useState('');

  const openLogicModal = (kpi: NonNullable<typeof allKpis>[number]) => {
    setSelectedKpi(kpi);
    setLogicModalOpen(true);
  };

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  const filteredKpis = useMemo(() => {
    let filtered = allKpis || [];
    // Filter by review period and year - ensure proper string comparison
    filtered = filtered.filter(kpi => {
      const periodMatch = kpi.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
      const yearMatch = kpi.review_year === selectedYear;
      return periodMatch && yearMatch;
    });
    if (selectedCategory) {
      filtered = filtered.filter(kpi => kpi.category_id === selectedCategory);
    }
    if (statusFilter) {
      filtered = filtered.filter(kpi => kpi.status === statusFilter);
    }
    return filtered;
  }, [allKpis, selectedCategory, statusFilter, selectedPeriod, selectedYear]);

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
          final_rating: auditor_rating,
          final_score: auditor_score,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      const newStatus = approve ? 'approved' : 'audit';
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'Audit review submitted' });
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

  const handleSubmitAudit = (approve: boolean) => {
    if (!selectedKpi || !auditorRating) return;
    const score = auditorRating === 'blue' ? 100 : auditorRating === 'green' ? 80 : auditorRating === 'yellow' ? 60 : 40;
    submitAuditReview.mutate({
      kpi_id: selectedKpi.id,
      auditor_rating: auditorRating,
      auditor_score: score,
      auditor_remarks: auditorRemarks,
      approve,
    });
  };

  // Stats
  const pendingAudit = allKpis?.filter(k => k.status === 'manager_check').length || 0;
  const inAudit = allKpis?.filter(k => k.status === 'audit').length || 0;
  const approved = allKpis?.filter(k => k.status === 'approved').length || 0;

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Panel</h1>
          <p className="text-muted-foreground">Review and approve performance evaluations</p>
        </div>
        <ReviewPeriodSelector
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          onPeriodChange={setSelectedPeriod}
          onYearChange={setSelectedYear}
        />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Audit</p>
                <p className="text-3xl font-bold text-yellow-600">{pendingAudit}</p>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Audit</p>
                <p className="text-3xl font-bold text-purple-600">{inAudit}</p>
                <p className="text-xs text-muted-foreground">Currently reviewing</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-3xl font-bold text-green-600">{approved}</p>
                <p className="text-xs text-muted-foreground">Fully completed</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manager_check">Pending Audit</SelectItem>
            <SelectItem value="audit">In Audit</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All Categories
          </Button>
          {categories?.map(cat => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
            >
              <div
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* KPIs Table */}
      <Card>
        <CardHeader>
          <CardTitle>KPIs for Audit</CardTitle>
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
                <TableHead>Self</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Auditor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
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
                    className={isNaKpi ? 'opacity-60 bg-muted/20' : ''}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{employee?.full_name || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">{employee?.employee_code}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: kpi.kra_categories?.color }}
                        />
                        <span className="text-sm">{kpi.kra_categories?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => openLogicModal(kpi)}
                        className="text-left hover:bg-muted/50 p-1 -m-1 rounded transition-colors cursor-pointer group"
                        title="Click to view KPI details"
                      >
                        <p className="font-medium text-primary group-hover:underline">{kpi.kra_name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          {kpi.kpi_name}
                          <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                      </button>
                    </TableCell>
                    <TableCell>{kpi.target_value}</TableCell>
                    <TableCell>
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          N/A
                        </Badge>
                      ) : (
                        submission?.achieved_value || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          N/A
                        </Badge>
                      ) : submission?.self_rating && (
                        <Badge
                          style={{ backgroundColor: ratingOptions.find(r => r.value === submission.self_rating)?.color }}
                          className="text-white"
                        >
                          {submission.self_score}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          N/A
                        </Badge>
                      ) : submission?.manager_rating && (
                        <Badge
                          style={{ backgroundColor: ratingOptions.find(r => r.value === submission.manager_rating)?.color }}
                          className="text-white"
                        >
                          {submission.manager_score}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          N/A
                        </Badge>
                      ) : submission?.auditor_rating && (
                        <Badge
                          style={{ backgroundColor: ratingOptions.find(r => r.value === submission.auditor_rating)?.color }}
                          className="text-white"
                        >
                          {submission.auditor_score}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[kpi.status]}>
                        {statusLabels[kpi.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {kpi.status === 'manager_check' && !isNaKpi && (
                        <Button size="sm" onClick={() => openReviewDialog(kpi)}>
                          Audit
                        </Button>
                      )}
                      {isNaKpi && (
                        <Badge variant="outline" className="text-gray-500">
                          Not Applicable
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!filteredKpis || filteredKpis.length === 0) && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No KPIs found matching the filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit Review</DialogTitle>
            <DialogDescription>
              {selectedKpi?.kpi_name} - {(selectedKpi?.profiles as any)?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg text-sm">
              <div>
                <Label className="text-muted-foreground">Self Rating</Label>
                <p className="font-medium">{submissionMap.get(selectedKpi?.id || '')?.self_rating || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Manager Rating</Label>
                <p className="font-medium">{submissionMap.get(selectedKpi?.id || '')?.manager_rating || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-muted-foreground">Manager Remarks</Label>
                <p>{submissionMap.get(selectedKpi?.id || '')?.manager_remarks || 'N/A'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Auditor Rating</Label>
              <Select value={auditorRating} onValueChange={(v) => setAuditorRating(v as RatingLevel)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select final rating" />
                </SelectTrigger>
                <SelectContent>
                  {ratingOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: opt.color }} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Auditor Remarks</Label>
              <Textarea
                value={auditorRemarks}
                onChange={(e) => setAuditorRemarks(e.target.value)}
                placeholder="Enter audit remarks..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button
              variant="secondary"
              onClick={() => handleSubmitAudit(false)}
              disabled={!auditorRating || submitAuditReview.isPending}
            >
              Save for Later
            </Button>
            <Button
              onClick={() => handleSubmitAudit(true)}
              disabled={!auditorRating || submitAuditReview.isPending}
            >
              Approve
            </Button>
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
