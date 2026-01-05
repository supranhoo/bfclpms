import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions, useSubmitSelfReview, RatingLevel, KPI } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
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
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { Target, TrendingUp, CheckCircle2, Clock, Send, Eye, AlertCircle, BarChart3 } from 'lucide-react';

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
      setIsNa(existing.is_na || false);
    } else {
      setAchievedValue('');
      setCalculatedScore(null);
      setCalculatedPercentage(null);
      setSelfRemarks('');
      setIsNa(false);
    }
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
      is_na: isNa,
    });

    setReviewDialogOpen(false);
  };

  if (isLoading) {
    return <KpiPageSkeleton />;
  }

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
                        {submission?.achieved_value != null ? (
                          <span className="font-mono text-sm font-medium">
                            {submission.achieved_value}
                          </span>
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
                          {kpi.status === 'kra_set' || kpi.status === 'self_review' ? (
                            <Button
                              size="sm"
                              variant={kpi.status === 'kra_set' ? 'default' : 'outline'}
                              onClick={() => openReviewDialog(kpi)}
                              className="h-8"
                            >
                              <Send className="h-3.5 w-3.5 mr-1" />
                              {kpi.status === 'kra_set' ? 'Submit' : 'Edit'}
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-8">
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
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

      {/* Self Review Sheet */}
      <Sheet open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <SheetContent size="xl" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Submit Self Review</SheetTitle>
            <SheetDescription>
              {selectedKpi?.kpi_name} - {selectedKpi?.kra_name}
            </SheetDescription>
          </SheetHeader>
          
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
                placeholder={isNa ? 'Explain why this KPI is not applicable...' : 'Describe your achievements, provide evidence or justification...'}
                rows={4}
              />
            </div>
          </div>

          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitReview} disabled={(!isNa && !achievedValue) || submitReview.isPending}>
              {submitReview.isPending ? 'Submitting...' : 'Submit Review'}
            </Button>
          </SheetFooter>
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
