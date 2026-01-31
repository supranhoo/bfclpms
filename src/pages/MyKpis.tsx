import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions, useSubmitSelfReview, RatingLevel, KPI, OrgLevelScope } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KpiPageSkeleton } from '@/components/ui/LoadingSkeletons';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { RatingScaleDisplay } from '@/components/review/RatingScaleDisplay';
import { Target, TrendingUp, CheckCircle2, Clock, Send, Eye, AlertCircle, BarChart3, Building2, Lock, Users, User, FileCheck } from 'lucide-react';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'Pending',
  self_review: 'Submitted',
  manager_check: 'Manager Review',
  audit: 'Audit',
  approved: 'Approved',
};

// Score to display config
const scoreDisplay: Record<number, { label: string; color: string; level: RatingLevel }> = {
  5: { label: 'Outstanding', color: '#3B82F6', level: 'blue' },
  4: { label: 'Exceeds Expectations', color: '#10B981', level: 'green' },
  3: { label: 'Meets Expectations', color: '#F59E0B', level: 'yellow' },
  2: { label: 'Below Expectations', color: '#EF4444', level: 'red' },
  1: { label: 'Needs Improvement', color: '#DC2626', level: 'red' },
  0: { label: 'Not Achieved', color: '#991B1B', level: 'red' },
};

export default function MyKpis() {
  const { profile } = useAuth();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  
  const { data: allKpis, isLoading } = useMyKpis();
  const { data: categories } = useKraCategories();
  
  // Filter KPIs by selected period
  const kpis = useMemo(() => {
    return allKpis?.filter(k => 
      k.review_period === selectedPeriod && k.review_year === selectedYear
    ) || [];
  }, [allKpis, selectedPeriod, selectedYear]);
  
  // Fetch org KPI values for this period (for org-level KPIs)
  const { data: orgKpiValues } = useOrgKpiValues(
    undefined, // category_id - we'll filter client-side by kpi's is_org_level
    selectedPeriod,
    selectedYear
  );

  // Create a map for org KPI values lookup based on scope
  // For organization scope: key = categoryId||kraName||kpiName||null||null
  // For department scope: key = categoryId||kraName||kpiName||departmentId||null  
  // For employee scope: key = categoryId||kraName||kpiName||null||employeeId
  const orgKpiValuesMap = useMemo(() => {
    const map = new Map<string, { achieved_value: number | null; data_source: string | null }>();
    orgKpiValues?.forEach(v => {
      const deptPart = v.department_id || 'null';
      const empPart = v.employee_id || 'null';
      const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}||${deptPart}||${empPart}`;
      map.set(key, { achieved_value: v.achieved_value, data_source: v.data_source });
    });
    return map;
  }, [orgKpiValues]);

  // Helper to get org KPI value based on scope
  const getOrgKpiValue = (kpi: KPI) => {
    if (!kpi.is_org_level) return null;
    
    const scope = kpi.org_level_scope || 'organization';
    let key: string;
    
    if (scope === 'organization') {
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
    } else if (scope === 'department') {
      // Look up by employee's department
      const deptId = profile?.department_id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${deptId}||null`;
    } else {
      // employee scope - look up by employee id
      const empId = profile?.id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||${empId}`;
    }
    
    return orgKpiValuesMap.get(key) || null;
  };

  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const submitReview = useSubmitSelfReview();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  
  // Review form state
  const [achievedValue, setAchievedValue] = useState('');
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);
  const [calculatedPercentage, setCalculatedPercentage] = useState<number | null>(null);
  const [selfRemarks, setSelfRemarks] = useState('');
  const [selfEvidenceUrl, setSelfEvidenceUrl] = useState<string | null>(null);
  const [isNa, setIsNa] = useState(false);

  const filteredKpis = selectedCategory
    ? kpis?.filter(k => k.category_id === selectedCategory)
    : kpis;

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = kpis?.length || 0;
    const pending = kpis?.filter(k => k.status === 'kra_set').length || 0;
    const submitted = kpis?.filter(k => k.status !== 'kra_set').length || 0;
    const approved = kpis?.filter(k => k.status === 'approved').length || 0;
    
    let totalWeightedScore = 0;
    let totalWeight = 0;
    
    kpis?.forEach(kpi => {
      const submission = submissionMap.get(kpi.id);
      const score = submission?.final_score || submission?.self_score || 0;
      const weight = kpi.weightage || 0;
      totalWeightedScore += score * weight;
      totalWeight += weight;
    });
    
    const avgRating = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const progressPercent = total > 0 ? (submitted / total) * 100 : 0;
    
    return { total, pending, submitted, approved, avgRating, progressPercent };
  }, [kpis, submissionMap]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    if (!categories || !kpis) return [];
    
    return categories.map(cat => {
      const catKpis = kpis.filter(k => k.category_id === cat.id);
      const completed = catKpis.filter(k => k.status !== 'kra_set').length;
      return {
        ...cat,
        total: catKpis.length,
        completed,
        percentage: catKpis.length > 0 ? (completed / catKpis.length) * 100 : 0,
      };
    }).filter(c => c.total > 0);
  }, [categories, kpis]);

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

  const openReviewDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    
    // Check if this is an org-level KPI and get value based on scope
    const orgValue = getOrgKpiValue(kpi);
    
    // Pre-fill with org value if available, otherwise use existing submission
    const prefilledValue = orgValue?.achieved_value ?? existing?.achieved_value;
    
    if (prefilledValue !== null && prefilledValue !== undefined) {
      setAchievedValue(prefilledValue.toString());
      const result = calculateScoreFromAchieved(prefilledValue, kpi);
      setCalculatedScore(result.rating);
      setCalculatedPercentage(result.percentage);
    } else {
      setAchievedValue('');
      setCalculatedScore(null);
      setCalculatedPercentage(null);
    }
    
    setSelfRemarks(existing?.self_remarks || '');
    setSelfEvidenceUrl(existing?.self_evidence_url || null);
    setIsNa(existing?.is_na || false);
    setReviewDialogOpen(true);
  };

  const openTimeline = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setTimelineOpen(true);
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
      self_evidence_url: selfEvidenceUrl,
      is_na: isNa,
    });

    setReviewDialogOpen(false);
  };

  if (isLoading) {
    return <KpiPageSkeleton />;
  }

  // Check for KPIs pending acceptance
  const kraSetKpis = kpis?.filter(k => k.status === 'kra_set') || [];
  const hasKraSetKpis = kraSetKpis.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My KPIs</h1>
          <p className="text-muted-foreground">
            Track and manage your performance indicators for {selectedPeriod} {selectedYear}
          </p>
        </div>
        <ReviewPeriodSelector
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          onPeriodChange={setSelectedPeriod}
          onYearChange={setSelectedYear}
        />
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total KPIs</p>
                <p className="text-3xl font-bold">{metrics.total}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
                <p className="text-3xl font-bold text-yellow-600">{metrics.pending}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-3xl font-bold text-green-600">{metrics.approved}</p>
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
                <p className="text-sm font-medium text-muted-foreground">Avg. Rating</p>
                <p className="text-3xl font-bold text-blue-600">{metrics.avgRating.toFixed(2)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress & Category Breakdown */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Overall Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Review Progress</CardTitle>
            <CardDescription>Your submission status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Submitted</span>
              <span className="font-medium">{metrics.submitted} / {metrics.total}</span>
            </div>
            <Progress value={metrics.progressPercent} className="h-3" />
            <p className="text-xs text-muted-foreground text-center">
              {metrics.progressPercent.toFixed(0)}% complete
            </p>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">KPIs by Category</CardTitle>
            <CardDescription>Click to filter by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryBreakdown.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all hover:shadow-sm ${
                    selectedCategory === cat.id 
                      ? 'ring-2 ring-primary border-primary bg-accent' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color || '#6B7280' }}
                  />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat.completed}/{cat.total} submitted
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                KPI Details
              </CardTitle>
              <CardDescription>
                {filteredKpis?.length || 0} KPIs {selectedCategory ? 'in selected category' : 'found'}
              </CardDescription>
            </div>
            {selectedCategory && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)}>
                Clear filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Category</TableHead>
                  <TableHead className="font-semibold">KRA</TableHead>
                  <TableHead className="font-semibold">KPI</TableHead>
                  <TableHead className="font-semibold text-center">Target</TableHead>
                  <TableHead className="font-semibold text-center">Achieved</TableHead>
                  <TableHead className="font-semibold text-center">Rating</TableHead>
                  <TableHead className="font-semibold text-center">Status</TableHead>
                  <TableHead className="font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {filteredKpis?.map((kpi, index) => {
                  const submission = submissionMap.get(kpi.id);
                  const score = submission?.final_score || submission?.self_score;
                  const scoreInfo = score !== null && score !== undefined ? scoreDisplay[score] : null;
                  // Get org-level value using scoped lookup
                  const orgValue = getOrgKpiValue(kpi);
                  const displayAchieved = kpi.is_org_level && orgValue?.achieved_value != null 
                    ? orgValue.achieved_value 
                    : submission?.achieved_value;
                  
                  // Determine scope badge
                  const scope = kpi.org_level_scope || 'organization';
                  
                  return (
                    <TableRow 
                      key={kpi.id}
                      className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: kpi.kra_categories?.color }}
                          />
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                            {kpi.kra_categories?.name}
                          </span>
                          {kpi.is_org_level && (
                            <Tooltip>
                              <TooltipTrigger>
                                {scope === 'organization' ? (
                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                ) : scope === 'department' ? (
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <User className="h-3 w-3 text-muted-foreground" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Organization-level KPI ({scope} scope)</p>
                                {orgValue?.data_source && <p className="text-xs">Source: {orgValue.data_source}</p>}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-sm line-clamp-2">{kpi.kra_name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm line-clamp-2">{kpi.kpi_name}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm">{kpi.target_value}</span>
                        {kpi.uom && (
                          <span className="text-xs text-muted-foreground ml-1">{kpi.uom}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {displayAchieved != null ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-mono text-sm font-medium">
                              {displayAchieved}
                            </span>
                            {kpi.is_org_level && orgValue && (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {scoreInfo ? (
                          <Badge
                            style={{ backgroundColor: scoreInfo.color }}
                            className="text-white text-xs"
                          >
                            {score} - {scoreInfo.label}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className={statusColors[kpi.status]}>
                          {statusLabels[kpi.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          {kpi.status === 'kra_set' ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => openReviewDialog(kpi)}
                              className="h-8"
                            >
                              <FileCheck className="h-3.5 w-3.5 mr-1" />
                              Accept & Submit
                            </Button>
                          ) : kpi.status === 'self_review' ? (
                            <Badge variant="secondary" className="h-8 px-3 flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              <Clock className="h-3.5 w-3.5" />
                              Pending Review
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="h-8 px-3 flex items-center gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {statusLabels[kpi.status] || 'Processed'}
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openTimeline(kpi)}
                            title="View Timeline"
                            className="h-8 w-8 p-0"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!filteredKpis || filteredKpis.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Target className="h-8 w-8" />
                        <p className="font-medium">No KPIs found</p>
                        <p className="text-sm">Try selecting a different period or category</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Self Review Sheet - Compact No-Scroll Layout */}
      <Sheet open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <SheetContent size="full" className="flex flex-col h-full p-4">
          {(() => {
            // Compute org-level state for the selected KPI (at KPI level now)
            const isSelectedKpiOrgLevel = selectedKpi?.is_org_level || false;
            const selectedKpiOrgValue = isSelectedKpiOrgLevel && selectedKpi
              ? orgKpiValuesMap.get(`${selectedKpi.category_id}||${selectedKpi.kra_name}||${selectedKpi.kpi_name}`)
              : null;
            const hasOrgData = isSelectedKpiOrgLevel && selectedKpiOrgValue?.achieved_value != null;
            const isKraSet = selectedKpi?.status === 'kra_set';
            
            return (
              <>
                {/* Header with Category, KRA, KPI */}
                <SheetHeader className="pb-3 border-b flex-shrink-0">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SheetTitle className="text-lg">
                          Submit Self Review
                        </SheetTitle>
                        {isKraSet && (
                          <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                            <FileCheck className="h-3 w-3 mr-1" />
                            New KRA
                          </Badge>
                        )}
                        {hasOrgData && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            Organization Data
                          </Badge>
                        )}
                      </div>
                      <Badge 
                        variant="outline" 
                        className="flex items-center gap-1.5"
                        style={{ borderColor: selectedKpi?.kra_categories?.color }}
                      >
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: selectedKpi?.kra_categories?.color }} 
                        />
                        {selectedKpi?.kra_categories?.name}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{selectedKpi?.kra_name}</p>
                      <SheetDescription className="text-sm">{selectedKpi?.kpi_name}</SheetDescription>
                    </div>
                  </div>
                </SheetHeader>
                
                {/* KRA Acceptance Info Banner */}
                {isKraSet && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg mt-3">
                    <FileCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium text-amber-800 dark:text-amber-200">
                        New KRA Assignment
                      </span>
                      <span className="text-amber-600 dark:text-amber-400 ml-1">
                        - Review the KPI details below and submit your performance data
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Org-Level Info Banner */}
                {hasOrgData && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg mt-3">
                    <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium text-blue-800 dark:text-blue-200">
                        Organization-Level KPI
                      </span>
                      <span className="text-blue-600 dark:text-blue-400 ml-1">
                        - Achieved value is pre-filled from verified organizational data
                        {selectedKpiOrgValue?.data_source && ` (Source: ${selectedKpiOrgValue.data_source})`}
                      </span>
                    </div>
                  </div>
                )}
          
          {/* Main Content - Grid Layout */}
          <div className="flex-1 grid grid-cols-3 gap-4 py-4 min-h-0">
            {/* Left Column - KPI Details */}
            <div className="space-y-4">
              {/* Key Metrics */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Target</span>
                  <span className="font-medium">{selectedKpi?.target_value} {selectedKpi?.uom}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Criteria</span>
                  <span className="font-medium text-sm">{selectedKpi?.criteria || 'Higher is Better'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Weightage</span>
                  <span className="font-medium">{selectedKpi?.weightage}%</span>
                </div>
              </div>

              {/* Rating Scale */}
              <RatingScaleDisplay kpi={selectedKpi} />
            </div>

            {/* Middle Column - Score Input */}
            <div className="space-y-4">
              {/* N/A Toggle */}
              <div className="flex items-center space-x-2 p-2 border rounded-lg bg-muted/30">
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
                  disabled={hasOrgData}
                />
                <Label htmlFor="is_na" className="cursor-pointer text-xs">
                  Mark as N/A (Not Applicable)
                  {hasOrgData && (
                    <span className="text-muted-foreground ml-1">(disabled for org data)</span>
                  )}
                </Label>
              </div>

              {/* Achieved Value */}
              {!isNa && (
                <div className="space-y-2">
                  <Label htmlFor="achieved" className="text-sm flex items-center gap-2">
                    Achieved Value *
                    {hasOrgData && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Verified organization data{selectedKpiOrgValue?.data_source && ` from ${selectedKpiOrgValue.data_source}`}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </Label>
                  <Input
                    id="achieved"
                    type="number"
                    value={achievedValue}
                    onChange={(e) => handleAchievedChange(e.target.value)}
                    placeholder="Enter value"
                    className={`h-9 ${hasOrgData ? 'bg-muted cursor-not-allowed' : ''}`}
                    readOnly={hasOrgData}
                    disabled={hasOrgData}
                  />
                  {hasOrgData && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Verified data - cannot be modified
                    </p>
                  )}
                  {!hasOrgData && achievedValue && selectedKpi?.target_value && (
                    <p className="text-xs text-muted-foreground">
                      {((parseFloat(achievedValue) / selectedKpi.target_value) * 100).toFixed(1)}% of target
                    </p>
                  )}
                </div>
              )}

              {/* Calculated Rating Display */}
              {!isNa && calculatedScore !== null && (
                <div className="p-3 border rounded-lg bg-muted/50">
                  <Label className="text-xs text-muted-foreground">Calculated Rating</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      style={{ backgroundColor: scoreDisplay[calculatedScore]?.color || '#991B1B' }}
                      className="text-white px-2 py-0.5"
                    >
                      {calculatedScore}
                    </Badge>
                    <span className="text-sm font-medium">{scoreDisplay[calculatedScore]?.label || 'Not Achieved'}</span>
                  </div>
                </div>
              )}

              {isNa && (
                <div className="p-3 border rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">
                    This KPI will be excluded from overall score calculations.
                  </p>
                </div>
              )}
            </div>

            {/* Right Column - Remarks & Evidence */}
            <div className="flex flex-col space-y-4">
              <div className="flex-1">
                <Label htmlFor="remarks" className="text-sm mb-2 block">
                  {isNa ? 'Reason for N/A' : 'Justification'}
                </Label>
                <Textarea
                  id="remarks"
                  value={selfRemarks}
                  onChange={(e) => setSelfRemarks(e.target.value)}
                  placeholder={isNa ? 'Explain why this KPI is not applicable...' : 'Describe your achievements...'}
                  className="resize-none min-h-[100px]"
                />
              </div>
              
              {/* Evidence Upload */}
              {profile?.id && selectedKpi && (
                <EvidenceUpload
                  userId={profile.id}
                  kpiId={selectedKpi.id}
                  existingUrl={selfEvidenceUrl}
                  onUploadComplete={(url) => setSelfEvidenceUrl(url || null)}
                />
              )}
            </div>
          </div>

                {/* Footer - Fixed at bottom */}
                <SheetFooter className="pt-3 border-t flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setReviewDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSubmitReview} disabled={(!isNa && !achievedValue) || submitReview.isPending}>
                    {submitReview.isPending ? 'Submitting...' : 'Review & Submit'}
                  </Button>
                </SheetFooter>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Timeline Modal */}
      <KpiTimeline
        isOpen={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        kpi={selectedKpi}
      />
    </div>
  );
}
