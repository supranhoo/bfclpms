import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKpisByPeriod, useReviewSubmissions, useSubmitSelfReview, RatingLevel, KPI, KpiStatus } from '@/hooks/useKpis';
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
import { KpiPageSkeleton } from '@/components/ui/LoadingSkeletons';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { KeyStatCard } from '@/components/dashboard/KeyStatCard';
import { OverallScoreChart } from '@/components/dashboard/OverallScoreChart';
import { CategoryScoreChart } from '@/components/dashboard/CategoryScoreChart';
import { Send, Eye, CheckCircle2, Clock, AlertCircle, Lock, Info, Target, TrendingUp, Users } from 'lucide-react';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  management_review: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'Pending Review',
  self_review: 'Submitted',
  manager_check: 'Under Manager Review',
  audit: 'Under Audit',
  management_review: 'Under Management Review',
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

// Score to display config
const scoreDisplay: Record<number, { label: string; color: string; level: RatingLevel }> = {
  5: { label: '5 - Outstanding', color: '#3B82F6', level: 'blue' },
  4: { label: '4 - Exceeds Expectations', color: '#10B981', level: 'green' },
  3: { label: '3 - Meets Expectations', color: '#F59E0B', level: 'yellow' },
  2: { label: '2 - Below Expectations', color: '#EF4444', level: 'red' },
  1: { label: '1 - Needs Improvement', color: '#DC2626', level: 'red' },
  0: { label: '0 - Not Achieved', color: '#991B1B', level: 'red' },
};

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
  
  // Fetch KPIs for selected review period (server-side filtered)
  const { data: allKpisRaw, isLoading: loadingAllKpis } = useKpisByPeriod(selectedPeriod, selectedYear);
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
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);
  const [calculatedPercentage, setCalculatedPercentage] = useState<number | null>(null);
  const [selfRemarks, setSelfRemarks] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [isNa, setIsNa] = useState(false);

  const openLogicModal = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setLogicModalOpen(true);
  };

  // Filter KPIs by period, category, status and employee hierarchy
  const filteredKpis = useMemo(() => {
    let filtered = allKpis || [];
    
    // Filter by review period and year - ensure proper string comparison
    filtered = filtered.filter(k => {
      const periodMatch = k.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
      const yearMatch = k.review_year === selectedYear;
      return periodMatch && yearMatch;
    });
    
    // Filter by category
    if (filters.categoryId) {
      filtered = filtered.filter(k => k.category_id === filters.categoryId);
    }
    
    // Filter by status
    if (filters.status) {
      filtered = filtered.filter(k => k.status === filters.status);
    }
    
    // Filter by employee hierarchy (Division > BU > Dept > Manager > Employee)
    if (filters.divisionId || filters.businessUnitId || filters.departmentId || filters.managerId || filters.employeeId) {
      // If filters are set but no matching employees, show no results
      if (filteredEmployeeIds.length === 0) {
        return [];
      }
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

  // Calculate comprehensive metrics for Admin dashboard view
  const metrics = useMemo(() => {
    const total = filteredKpis?.length || 0;
    const kraSet = filteredKpis?.filter(k => k.status === 'kra_set').length || 0;
    const selfReview = filteredKpis?.filter(k => k.status === 'self_review').length || 0;
    const managerCheck = filteredKpis?.filter(k => k.status === 'manager_check').length || 0;
    const audit = filteredKpis?.filter(k => k.status === 'audit').length || 0;
    const approved = filteredKpis?.filter(k => k.status === 'approved').length || 0;
    
    // Count unique employees
    const uniqueEmployees = new Set(filteredKpis?.map(k => k.employee_id)).size;
    
    // Calculate overall scores
    let totalScore = 0;
    let totalWeight = 0;
    let totalMaxScore = 0;
    
    filteredKpis?.forEach(kpi => {
      const submission = submissionMap.get(kpi.id);
      const score = submission?.final_score || submission?.self_score || 0;
      const weight = kpi.weightage || 0;
      totalScore += score * weight;
      totalWeight += weight;
      totalMaxScore += weight * 5;
    });
    
    const overallRating = totalWeight > 0 ? totalScore / totalWeight : 0;
    const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    
    return {
      total,
      kraSet,
      selfReview,
      managerCheck,
      audit,
      approved,
      uniqueEmployees,
      totalScore,
      totalMaxScore,
      overallRating,
      overallPercentage,
    };
  }, [filteredKpis, submissionMap]);

  // Category metrics for chart
  const categoryMetrics = useMemo(() => {
    if (!categories || !filteredKpis) return [];

    return categories.map(cat => {
      const catKpis = filteredKpis.filter(k => k.category_id === cat.id);
      let achieved = 0;
      let max = 0;

      catKpis.forEach(kpi => {
        const submission = submissionMap.get(kpi.id);
        const score = submission?.final_score || submission?.self_score || 0;
        const weight = kpi.weightage || 0;
        achieved += score * weight;
        max += weight * 5;
      });

      return {
        name: cat.name,
        percentage: max > 0 ? (achieved / max) * 100 : 0,
        color: cat.color,
        count: catKpis.length,
        weightage: cat.weightage,
      };
    }).filter(c => c.count > 0).sort((a, b) => b.percentage - a.percentage);
  }, [categories, filteredKpis, submissionMap]);

  // Calculate progress (for non-admin view)
  const totalKpis = filteredKpis?.length || 0;
  const submittedKpis = filteredKpis?.filter(k => k.status !== 'kra_set').length || 0;
  const progressPercent = totalKpis > 0 ? (submittedKpis / totalKpis) * 100 : 0;

  const openReviewDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    if (existing) {
      setAchievedValue(existing.achieved_value?.toString() || '');
      // Re-calculate score from achieved value
      if (existing.achieved_value !== null && existing.achieved_value !== undefined) {
        const result = calculateScoreFromAchieved(existing.achieved_value, kpi);
        setCalculatedScore(result.rating);
        setCalculatedPercentage(result.percentage);
      } else {
        setCalculatedScore(existing.self_score || null);
        setCalculatedPercentage(null);
      }
      setSelfRemarks(existing.self_remarks || '');
      setEvidenceUrl(existing.self_evidence_url || null);
      setIsNa(existing.is_na || false);
    } else {
      setAchievedValue('');
      setCalculatedScore(null);
      setCalculatedPercentage(null);
      setSelfRemarks('');
      setEvidenceUrl(null);
      setIsNa(false);
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

  // Calculate score from achieved value using the formula
  const calculateScoreFromAchieved = (achieved: number, kpi: KPI) => {
    const thresholds: RatingThresholds = {
      r5: kpi.r5,
      r4: kpi.r4,
      r3: kpi.r3,
      r2: kpi.r2,
      r1: kpi.r1,
      r0: kpi.r0
    };
    
    return calculateRating(achieved, kpi.target_value, thresholds, kpi.criteria || 'Higher is Better', kpi.weightage || 0);
  };

  const handleAchievedChange = (value: string) => {
    setAchievedValue(value);
    if (selectedKpi && value) {
      const result = calculateScoreFromAchieved(parseFloat(value), selectedKpi);
      setCalculatedScore(result.rating);
      setCalculatedPercentage(result.percentage);
    } else {
      setCalculatedScore(null);
      setCalculatedPercentage(null);
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedKpi) return;
    
    // For NA submissions, score is not required
    // For regular submissions, need achieved value (score is auto-calculated)
    if (!isNa && !achievedValue) return;

    // Convert numeric score to rating level for storage
    const getRatingLevel = (score: number): RatingLevel => {
      if (score >= 4) return 'blue';
      if (score >= 3) return 'green';
      if (score >= 2) return 'yellow';
      return 'red';
    };

    await submitReview.mutateAsync({
      kpi_id: selectedKpi.id,
      achieved_value: isNa ? null : (parseFloat(achievedValue) || 0),
      self_rating: isNa ? null : (calculatedScore !== null ? getRatingLevel(calculatedScore) : null),
      self_score: isNa ? null : calculatedScore,
      self_remarks: selfRemarks,
      self_evidence_url: evidenceUrl,
      is_na: isNa,
    });

    setReviewDialogOpen(false);
  };

  const isLoading = loadingAllKpis || loadingFilters;

  if (isLoading) {
    return <KpiPageSkeleton />;
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
            showStatusFilter={true}
            isLoading={loadingFilters}
          />
        </CardContent>
      </Card>

      {/* Admin Dashboard Stats */}
      {isAdmin && (
        <>
          {/* Key Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KeyStatCard
              title="Total KPIs"
              value={metrics.total}
              subtitle={`${metrics.uniqueEmployees} employees`}
              icon={Target}
            />
            <KeyStatCard
              title="Overall Rating"
              value={`${metrics.overallRating.toFixed(2)} / 5.00`}
              icon={TrendingUp}
            />
            <KeyStatCard
              title="Completed"
              value={metrics.approved}
              subtitle={`${((metrics.approved / metrics.total) * 100 || 0).toFixed(0)}% of total`}
              icon={CheckCircle2}
              valueClassName="text-green-600"
            />
            <KeyStatCard
              title="Pending Review"
              value={metrics.kraSet}
              subtitle="Not yet submitted"
              icon={Clock}
              valueClassName="text-yellow-600"
            />
          </div>

          {/* Performance Charts */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Overall Performance</CardTitle>
                <CardDescription>Achievement percentage</CardDescription>
              </CardHeader>
              <CardContent className="h-[200px]">
                <OverallScoreChart 
                  percentage={metrics.overallPercentage} 
                  rating={metrics.overallRating}
                />
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Performance by Category</CardTitle>
                <CardDescription>Score breakdown across KRA categories</CardDescription>
              </CardHeader>
              <CardContent className="h-[200px]">
                <CategoryScoreChart data={categoryMetrics} />
              </CardContent>
            </Card>
          </div>

          {/* Status Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Review Status Overview</CardTitle>
              <CardDescription>Progress across all review stages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-5">
                {[
                  { key: 'kra_set', label: 'KRA Set', count: metrics.kraSet },
                  { key: 'self_review', label: 'Self Review', count: metrics.selfReview },
                  { key: 'manager_check', label: 'Manager Check', count: metrics.managerCheck },
                  { key: 'audit', label: 'Audit', count: metrics.audit },
                  { key: 'approved', label: 'Approved', count: metrics.approved },
                ].map(({ key, label, count }) => {
                  const percentage = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
                  const isActive = filters.status === key;
                  
                  return (
                    <button
                      key={key}
                      onClick={() => updateFilter('status', isActive ? '' : key)}
                      className={`space-y-2 text-left p-3 rounded-lg border transition-all hover:shadow-md ${
                        isActive 
                          ? 'ring-2 ring-primary border-primary bg-accent' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="secondary" className={statusColors[key]}>
                          {label}
                        </Badge>
                        <span className="font-medium">{count}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Progress Card - For Non-Admin */}
      {!isAdmin && (
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
      )}

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
                const isNaKpi = submission?.is_na || false;
                
                return (
                  <TableRow 
                    key={kpi.id} 
                    className={`${isLocked ? 'opacity-75 bg-muted/30' : ''} ${isNaKpi ? 'opacity-60 bg-muted/20' : ''}`}
                  >
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
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          N/A
                        </Badge>
                      ) : submission?.achieved_value !== null && submission?.achieved_value !== undefined ? (
                        <span className="font-medium">{submission.achieved_value}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isNaKpi ? (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          N/A
                        </Badge>
                      ) : submission?.self_score !== null && submission?.self_score !== undefined ? (
                        <Badge
                          style={{
                            backgroundColor: scoreDisplay[submission.self_score]?.color || '#991B1B',
                          }}
                          className="text-white"
                        >
                          {submission.self_score}
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

            {/* Mark as N/A Checkbox */}
            <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/30">
              <Checkbox
                id="is_na"
                checked={isNa}
                onCheckedChange={(checked) => {
                  setIsNa(checked as boolean);
                  if (checked) {
                    setAchievedValue('');
                    setCalculatedScore(null);
                    setCalculatedPercentage(null);
                  }
                }}
              />
              <Label htmlFor="is_na" className="cursor-pointer text-sm">
                Mark as N/A (Not Applicable) - This KPI does not apply for this review period
              </Label>
            </div>

            {/* Achieved Value - Hidden when N/A */}
            {!isNa && (
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
            )}
            
            {/* Calculated Score Display - Hidden when N/A */}
            {!isNa && calculatedScore !== null && (
              <div className="space-y-2">
                <Label>Calculated Rating</Label>
                <div className="p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge
                        style={{ backgroundColor: scoreDisplay[calculatedScore]?.color || '#991B1B' }}
                        className="text-white text-lg px-3 py-1"
                      >
                        {calculatedScore}
                      </Badge>
                      <span className="font-medium">{scoreDisplay[calculatedScore]?.label || 'Not Achieved'}</span>
                    </div>
                    {calculatedPercentage !== null && (
                      <span className="text-sm text-muted-foreground">
                        {calculatedPercentage.toFixed(1)}% achievement ratio
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* N/A Notice */}
            {isNa && (
              <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                <p className="text-sm text-muted-foreground">
                  This KPI will be marked as Not Applicable. It will be excluded from overall score calculations.
                </p>
              </div>
            )}

            {/* Self Remarks */}
            <div className="space-y-2">
              <Label htmlFor="remarks">{isNa ? 'Reason for N/A' : 'Justification & Evidence'}</Label>
              <Textarea
                id="remarks"
                value={selfRemarks}
                onChange={(e) => setSelfRemarks(e.target.value)}
                placeholder={isNa ? 'Explain why this KPI is not applicable...' : 'Describe your achievements, provide evidence or justification for your rating...'}
                rows={4}
              />
            </div>

            {/* Evidence File Upload - Hidden when N/A */}
            {!isNa && user && selectedKpi && (
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
              disabled={(!isNa && !achievedValue) || submitReview.isPending}
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
                      {submissionMap.get(selectedKpi.id)?.self_score !== null && (
                        <Badge
                          style={{
                            backgroundColor: scoreDisplay[submissionMap.get(selectedKpi.id)?.self_score || 0]?.color || '#991B1B',
                          }}
                          className="text-white"
                        >
                          {submissionMap.get(selectedKpi.id)?.self_score} - {scoreDisplay[submissionMap.get(selectedKpi.id)?.self_score || 0]?.label?.split(' - ')[1] || 'Not Achieved'}
                        </Badge>
                      )}
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
