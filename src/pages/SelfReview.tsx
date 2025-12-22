import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAllKpis, useReviewSubmissions, useSubmitSelfReview, RatingLevel, KPI, KpiStatus } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { useKpiFilters } from '@/hooks/useKpiFilters';
import { KpiFilterBar } from '@/components/ui/KpiFilterBar';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { Send, Eye, CheckCircle2, Clock, AlertCircle, Lock, Info } from 'lucide-react';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'Pending Review',
  self_review: 'Submitted',
  manager_check: 'Under Manager Review',
  audit: 'Under Audit',
  approved: 'Approved',
};

const kpiStatusColors: Record<KpiStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved_by_manager: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  locked: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const kpiStatusLabels: Record<KpiStatus, string> = {
  open: 'Open',
  submitted: 'Submitted',
  approved_by_manager: 'Approved',
  locked: 'Locked',
};

const ratingOptions: { value: RatingLevel; label: string; color: string; score: number }[] = [
  { value: 'blue', label: 'Outstanding (5)', color: '#3B82F6', score: 5 },
  { value: 'green', label: 'Exceeds Expectations (4)', color: '#10B981', score: 4 },
  { value: 'yellow', label: 'Meets Expectations (3)', color: '#F59E0B', score: 3 },
  { value: 'red', label: 'Below Expectations (1-2)', color: '#EF4444', score: 2 },
];

export default function SelfReview() {
  const { user } = useAuth();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  
  // Review period filter state
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  
  // Use centralized KPI filters
  const {
    filters,
    updateFilter,
    resetFilters,
    divisions,
    businessUnits,
    departments,
    managers,
    employees,
    filteredEmployeeIds,
    isLoading: loadingFilters,
    isAdmin,
  } = useKpiFilters();
  
  // Fetch all KPIs with employee info
  const { data: allKpisRaw, isLoading: loadingAllKpis } = useAllKpis();
  
  const allKpis = useMemo(() => {
    if (!allKpisRaw) return [];
    return allKpisRaw.map(k => ({
      ...k,
      employee: k.profiles as { id: string; full_name: string | null; email: string; employee_code: string | null } | null
    }));
  }, [allKpisRaw]);

  const { data: categories } = useKraCategories();
  const kpiIds = allKpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const submitReview = useSubmitSelfReview();

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  
  // Review form state
  const [achievedValue, setAchievedValue] = useState('');
  const [selfRating, setSelfRating] = useState<RatingLevel | ''>('');
  const [selfRemarks, setSelfRemarks] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);

  const openLogicModal = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setLogicModalOpen(true);
  };

  // Filter KPIs by period, category, status and employee hierarchy
  const filteredKpis = useMemo(() => {
    let filtered = allKpis || [];
    
    // Filter by review period and year
    filtered = filtered.filter(k => 
      k.review_period === selectedPeriod && k.review_year === selectedYear
    );
    
    // Filter by category
    if (filters.categoryId) {
      filtered = filtered.filter(k => k.category_id === filters.categoryId);
    }
    
    // Filter by status
    if (filters.status) {
      filtered = filtered.filter(k => k.status === filters.status);
    }
    
    // Filter by employee hierarchy (Division > BU > Dept > Manager > Employee)
    if (filteredEmployeeIds.length > 0 && (filters.divisionId || filters.businessUnitId || filters.departmentId || filters.managerId || filters.employeeId)) {
      filtered = filtered.filter(k => filteredEmployeeIds.includes(k.employee_id));
    }
    
    // For non-admin users, only show their own KPIs
    if (!isAdmin && user?.id) {
      filtered = filtered.filter(k => k.employee_id === user.id);
    }
    
    // Show all KPIs regardless of status - Self Review page should show complete progress
    // Status filter is still applied if explicitly selected
    
    return filtered;
  }, [allKpis, filters, filteredEmployeeIds, selectedPeriod, selectedYear, isAdmin, user?.id]);

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  // Calculate progress
  const totalKpis = filteredKpis?.length || 0;
  const submittedKpis = filteredKpis?.filter(k => k.status === 'self_review').length || 0;
  const progressPercent = totalKpis > 0 ? (submittedKpis / totalKpis) * 100 : 0;

  const openReviewDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    if (existing) {
      setAchievedValue(existing.achieved_value?.toString() || '');
      setSelfRating(existing.self_rating || '');
      setSelfRemarks(existing.self_remarks || '');
      setEvidenceUrl(existing.self_evidence_url || null);
    } else {
      setAchievedValue('');
      setSelfRating('');
      setSelfRemarks('');
      setEvidenceUrl(null);
    }
    setReviewDialogOpen(true);
  };

  const openViewDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setViewDialogOpen(true);
  };

  const openTimeline = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setTimelineOpen(true);
  };

  // Auto-calculate rating based on achieved value
  const calculateSuggestedRating = (achieved: number, kpi: KPI): RatingLevel | null => {
    if (!kpi.target_value) return null;
    
    const thresholds: RatingThresholds = {
      r5: kpi.r5,
      r4: kpi.r4,
      r3: kpi.r3,
      r2: kpi.r2,
      r1: kpi.r1,
      r0: kpi.r0
    };
    
    const result = calculateRating(achieved, kpi.target_value, thresholds, kpi.criteria || 'Higher is Better', kpi.weightage || 0);
    return result.ratingLevel;
  };

  const handleAchievedChange = (value: string) => {
    setAchievedValue(value);
    if (selectedKpi && value) {
      const suggested = calculateSuggestedRating(parseFloat(value), selectedKpi);
      if (suggested) {
        setSelfRating(suggested);
      }
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedKpi || !selfRating) return;

    const scoreMap: Record<RatingLevel, number> = {
      blue: 5,
      green: 4,
      yellow: 3,
      red: 2
    };

    await submitReview.mutateAsync({
      kpi_id: selectedKpi.id,
      achieved_value: parseFloat(achievedValue) || 0,
      self_rating: selfRating,
      self_score: scoreMap[selfRating],
      self_remarks: selfRemarks,
      self_evidence_url: evidenceUrl,
    });

    setReviewDialogOpen(false);
  };

  const isLoading = loadingAllKpis || loadingFilters;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Self Review</h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'View and manage employee self-assessments' : 'Submit your self-assessment for each KPI'}
          </p>
        </div>
        <ReviewPeriodSelector
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          onPeriodChange={setSelectedPeriod}
          onYearChange={setSelectedYear}
        />
      </div>

      {/* Hierarchical Filters */}
      <Card>
        <CardContent className="pt-6">
          <KpiFilterBar
            filters={filters}
            updateFilter={updateFilter}
            resetFilters={resetFilters}
            divisions={divisions}
            businessUnits={businessUnits}
            departments={departments}
            managers={managers}
            employees={employees}
            categories={categories}
            showCategoryFilter={true}
            isLoading={loadingFilters}
          />
        </CardContent>
      </Card>

      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="font-medium">Review Progress</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {submittedKpis} of {totalKpis} KPIs reviewed
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{totalKpis - submittedKpis} Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>{submittedKpis} Submitted</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs Table */}
      <Card>
        <CardHeader>
          <CardTitle>KPIs for Self Review</CardTitle>
          <CardDescription>
            {filteredKpis?.length || 0} KPIs {(filters.categoryId || filters.employeeId || filters.departmentId) ? 'matching filters' : 'pending review'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>KRA / KPI</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Weightage</TableHead>
                <TableHead>Achieved</TableHead>
                <TableHead>Self Rating</TableHead>
                <TableHead>KPI Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKpis?.map(kpi => {
                const submission = submissionMap.get(kpi.id);
                const employee = 'employee' in kpi ? (kpi as any).employee : null;
                const kpiStatus = submission?.kpi_status || 'open';
                const isLocked = kpiStatus === 'approved_by_manager' || kpiStatus === 'locked';
                const canEdit = !isLocked && (isAdmin || kpi.employee_id === user?.id);
                
                return (
                  <TableRow key={kpi.id} className={isLocked ? 'opacity-75 bg-muted/30' : ''}>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{employee?.full_name || '-'}</div>
                        <div className="text-muted-foreground text-xs">{employee?.employee_code}</div>
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
                    <TableCell className="max-w-[200px]">
                      <button
                        onClick={() => openLogicModal(kpi)}
                        className="text-left hover:bg-muted/50 p-1 -m-1 rounded transition-colors cursor-pointer group w-full"
                        title="Click to view KPI details"
                      >
                        <div className="font-medium text-primary group-hover:underline truncate">
                          {kpi.kra_name}
                        </div>
                        <div className="text-sm text-muted-foreground truncate flex items-center gap-1">
                          {kpi.kpi_name}
                          <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>
                      {kpi.target_value} {kpi.uom && <span className="text-muted-foreground text-xs">({kpi.uom})</span>}
                    </TableCell>
                    <TableCell>{kpi.weightage}%</TableCell>
                    <TableCell>
                      {submission?.achieved_value !== null && submission?.achieved_value !== undefined ? (
                        <span className="font-medium">{submission.achieved_value}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {submission?.self_rating ? (
                        <Badge
                          style={{
                            backgroundColor: ratingOptions.find(r => r.value === submission.self_rating)?.color,
                          }}
                          className="text-white"
                        >
                          {ratingOptions.find(r => r.value === submission.self_rating)?.label.split(' ')[0]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
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
                      <div className="flex gap-2">
                        {/* Only allow editing if KPI is not locked */}
                        {canEdit && kpiStatus === 'open' && (
                          <Button
                            size="sm"
                            onClick={() => openReviewDialog(kpi)}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Submit
                          </Button>
                        )}
                        {canEdit && kpiStatus === 'submitted' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReviewDialog(kpi)}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                        {isLocked && (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Lock className="h-3 w-3 mr-1" />
                            Locked
                          </Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openViewDialog(kpi)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openTimeline(kpi)} title="View Timeline">
                          <Clock className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!filteredKpis || filteredKpis.length === 0) && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No KPIs pending self review
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Self Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Submit Self Review</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{selectedKpi?.kra_name}</span> - {selectedKpi?.kpi_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* KPI Details */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-xs text-muted-foreground">Target</Label>
                <p className="font-medium">{selectedKpi?.target_value} {selectedKpi?.uom}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Criteria</Label>
                <p className="font-medium text-sm">{selectedKpi?.criteria || 'Higher is Better'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Weightage</Label>
                <p className="font-medium">{selectedKpi?.weightage}%</p>
              </div>
            </div>

            {/* Rating Scale Reference */}
            {selectedKpi && (selectedKpi.r5 || selectedKpi.r4 || selectedKpi.r3) && (
              <div className="p-4 border rounded-lg space-y-2">
                <Label className="text-sm font-medium">Rating Scale</Label>
                <div className="grid gap-1 text-sm">
                  {selectedKpi.r5 && <div className="flex justify-between"><span className="text-blue-600">R5 (Outstanding):</span> <span>{selectedKpi.r5}</span></div>}
                  {selectedKpi.r4 && <div className="flex justify-between"><span className="text-green-600">R4 (Exceeds):</span> <span>{selectedKpi.r4}</span></div>}
                  {selectedKpi.r3 && <div className="flex justify-between"><span className="text-yellow-600">R3 (Meets):</span> <span>{selectedKpi.r3}</span></div>}
                  {selectedKpi.r2 && <div className="flex justify-between"><span className="text-orange-600">R2 (Below):</span> <span>{selectedKpi.r2}</span></div>}
                  {selectedKpi.r1 && <div className="flex justify-between"><span className="text-red-600">R1 (Poor):</span> <span>{selectedKpi.r1}</span></div>}
                </div>
              </div>
            )}

            {/* Achieved Value */}
            <div className="space-y-2">
              <Label htmlFor="achieved">Achieved Value *</Label>
              <Input
                id="achieved"
                type="number"
                value={achievedValue}
                onChange={(e) => handleAchievedChange(e.target.value)}
                placeholder="Enter your achieved value"
              />
              {achievedValue && selectedKpi?.target_value && (
                <p className="text-sm text-muted-foreground">
                  Achievement: {((parseFloat(achievedValue) / selectedKpi.target_value) * 100).toFixed(1)}% of target
                </p>
              )}
            </div>
            
            {/* Self Rating */}
            <div className="space-y-2">
              <Label htmlFor="rating">Self Rating *</Label>
              <Select value={selfRating} onValueChange={(v) => setSelfRating(v as RatingLevel)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your rating" />
                </SelectTrigger>
                <SelectContent>
                  {ratingOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: opt.color }}
                        />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Self Remarks */}
            <div className="space-y-2">
              <Label htmlFor="remarks">Justification & Evidence</Label>
              <Textarea
                id="remarks"
                value={selfRemarks}
                onChange={(e) => setSelfRemarks(e.target.value)}
                placeholder="Describe your achievements, provide evidence or justification for your rating..."
                rows={4}
              />
            </div>

            {/* Evidence File Upload */}
            {user && selectedKpi && (
              <EvidenceUpload
                userId={user.id}
                kpiId={selectedKpi.id}
                existingUrl={evidenceUrl}
                onUploadComplete={(url) => setEvidenceUrl(url || null)}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitReview} 
              disabled={!selfRating || !achievedValue || submitReview.isPending}
            >
              {submitReview.isPending ? 'Submitting...' : 'Submit Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View KPI Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>KPI Details</DialogTitle>
            <DialogDescription>
              {selectedKpi?.kra_categories?.name} - {selectedKpi?.kra_name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedKpi && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">KPI Name</Label>
                  <p className="font-medium">{selectedKpi.kpi_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Target</Label>
                  <p className="font-medium">{selectedKpi.target_value} {selectedKpi.uom}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Criteria</Label>
                  <p className="font-medium">{selectedKpi.criteria || 'Higher is Better'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Weightage</Label>
                  <p className="font-medium">{selectedKpi.weightage}%</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Frequency</Label>
                  <p className="font-medium">{selectedKpi.frequency || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Source of Data</Label>
                  <p className="font-medium">{selectedKpi.source_of_data || '-'}</p>
                </div>
              </div>

              {submissionMap.get(selectedKpi.id) && (
                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-medium">Self Review Submission</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Achieved Value</Label>
                      <p className="font-medium">{submissionMap.get(selectedKpi.id)?.achieved_value}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Self Rating</Label>
                      <Badge
                        style={{
                          backgroundColor: ratingOptions.find(r => r.value === submissionMap.get(selectedKpi.id)?.self_rating)?.color,
                        }}
                        className="text-white"
                      >
                        {ratingOptions.find(r => r.value === submissionMap.get(selectedKpi.id)?.self_rating)?.label}
                      </Badge>
                    </div>
                  </div>
                  {submissionMap.get(selectedKpi.id)?.self_remarks && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Self Remarks</Label>
                      <p className="text-sm mt-1">{submissionMap.get(selectedKpi.id)?.self_remarks}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
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
