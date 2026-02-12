import { useState, useMemo, useCallback } from 'react';
import { safeParseFloat } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { KpiDetailsTable } from '@/components/review/KpiDetailsTable';
import { MobileKpiCard } from '@/components/review/MobileKpiCard';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions, useSubmitSelfReview, RatingLevel, KPI, OrgLevelScope } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { useKpiSorting } from '@/hooks/useKpiSorting';
import { useSubPeriodSubmissionsByKpis, useSubmitSubPeriod, SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { useDailyAggregationMethod } from '@/hooks/useSystemSettings';
import { calculateDailyAggregatedScore, DailyAggregationMethod } from '@/lib/dailyAggregation';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { QualitativeOption, calculateQualitativeRating, scoreToRatingLevel } from '@/lib/qualitativeUom';
import { 
  FrequencyType, 
  requiresSubPeriodSelection, 
  hasMultiMonthCycle, 
  isKpiLockedForPeriod,
  getMonthNumber 
} from '@/lib/frequencyUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { KpiPageSkeleton } from '@/components/ui/LoadingSkeletons';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
import { KpiReviewPanel } from '@/components/review/KpiReviewPanel';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { RatingScaleDisplay } from '@/components/review/RatingScaleDisplay';
import { KpiSortControl } from '@/components/ui/KpiSortControl';
import { SubPeriodSelector } from '@/components/review/SubPeriodSelector';
import { FrequencyLockedOverlay, FrequencyLockBadge } from '@/components/review/FrequencyLockedOverlay';
import { QualitativeValueInput } from '@/components/review/QualitativeValueInput';
import { DateCalendarInput } from '@/components/review/DateCalendarInput';
import { Target, TrendingUp, CheckCircle2, Send, Eye, AlertCircle, BarChart3, Building2, Lock, Users, User, FileCheck, Calendar, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  
  const { data: allKpis, isLoading } = useMyKpis();
  const { data: categories } = useKraCategories();
  const { method: dailyAggregationMethod } = useDailyAggregationMethod();
  
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

  // Fetch ALL submissions across all periods for KPI Tracker Modal history
  const allKpiIds = useMemo(() => allKpis?.map(k => k.id) || [], [allKpis]);
  const { data: allSubmissions } = useReviewSubmissions(allKpiIds);
  const submitReview = useSubmitSelfReview();
  
  // Sub-period submissions for Daily/Weekly KPIs
  const { data: subPeriodSubmissions, isLoading: subPeriodLoading } = useSubPeriodSubmissionsByKpis(kpiIds, selectedPeriod, selectedYear);
  const submitSubPeriod = useSubmitSubPeriod();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  const [expandedKpis, setExpandedKpis] = useState<Set<string>>(new Set());
  
  // Toggle expand for daily KPI rows
  const toggleExpand = useCallback((kpiId: string) => {
    setExpandedKpis(prev => {
      const next = new Set(prev);
      if (next.has(kpiId)) next.delete(kpiId);
      else next.add(kpiId);
      return next;
    });
  }, []);
  
  // Review form state
  const [achievedValue, setAchievedValue] = useState('');
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);
  const [calculatedPercentage, setCalculatedPercentage] = useState<number | null>(null);
  const [calculatedRatingLevel, setCalculatedRatingLevel] = useState<RatingLevel | null>(null);
  const [selfRemarks, setSelfRemarks] = useState('');
  const [selfEvidenceUrls, setSelfEvidenceUrls] = useState<string[]>([]);
  const [isNa, setIsNa] = useState(false);
  
  // Resubmission confirmation state for Daily/Weekly KPIs
  const [showResubmitConfirm, setShowResubmitConfirm] = useState(false);
  const [resubmitReason, setResubmitReason] = useState('');
  const [pendingResubmitReason, setPendingResubmitReason] = useState('');
  
  // Monthly submission confirmation state for Daily/Weekly KPIs
  const [showMonthlySubmitConfirm, setShowMonthlySubmitConfirm] = useState(false);
  const [isSubmittingMonthly, setIsSubmittingMonthly] = useState(false);

  // Helper to check if KPI is qualitative
  const isQualitativeKpi = (kpi: KPI | null): boolean => {
    return kpi?.uom_type === 'binary' || kpi?.uom_type === 'tiered';
  };
  
  // Sub-period selection state for Daily/Weekly KPIs
  const [selectedSubPeriod, setSelectedSubPeriod] = useState<string | null>(null);
  
  // Helper to get sub-period submissions for a KPI - memoized to prevent stale closures
  const getKpiSubPeriodSubmissions = useCallback((kpiId: string) => {
    return subPeriodSubmissions?.filter(s => s.kpi_id === kpiId) || [];
  }, [subPeriodSubmissions]);

  // Computed values for selected KPI's sub-period submissions (used in dialogs)
  const selectedKpiSubPeriods = useMemo(() => {
    return selectedKpi ? getKpiSubPeriodSubmissions(selectedKpi.id) : [];
  }, [selectedKpi, getKpiSubPeriodSubmissions]);
  
  const aggregatedSubPeriodScore = useMemo(() => {
    if (selectedKpiSubPeriods.length === 0) return null;
    const values = selectedKpiSubPeriods
      .filter(s => s.achieved_value !== null)
      .map(s => s.achieved_value as number);
    const isBinaryKpi = selectedKpi?.uom_type === 'binary';
    const result = calculateDailyAggregatedScore(values, dailyAggregationMethod, selectedPeriod, selectedYear, isBinaryKpi);
    return result.score;
  }, [selectedKpiSubPeriods, dailyAggregationMethod, selectedPeriod, selectedYear, selectedKpi]);

  const filteredKpis = selectedCategory
    ? kpis?.filter(k => k.category_id === selectedCategory)
    : kpis;

  const submissionMap = useMemo(() => new Map(submissions?.map(s => [s.kpi_id, s])), [submissions]);

  // Sorting with default Weightage (High to Low)
  const { sortedKpis, sortConfig, setSort } = useKpiSorting(filteredKpis, {}, submissionMap);

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
      const score = submission?.final_score ?? submission?.management_score ?? submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? 0;
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
    
    const uomType = kpi.uom_type || 'numeric';
    const isQualitative = uomType === 'binary' || uomType === 'tiered';
    
    // For daily/weekly binary/tiered KPIs, the aggregated score IS the final rating
    // The score 0-5 from calculateBinaryDailyScore maps directly to the rating
    if (isQualitative && (kpi.frequency === 'Daily' || kpi.frequency === 'Weekly')) {
      const rating = Math.min(5, Math.max(0, Math.round(achieved)));
      const ratingLevel = rating >= 4 ? 'blue' : rating >= 3 ? 'green' : rating >= 2 ? 'yellow' : 'red';
      return {
        rating,
        ratingLevel: ratingLevel as 'blue' | 'green' | 'yellow' | 'red',
        weightedScore: (kpi.weightage || 0) * rating,
        percentage: (rating / 5) * 100,
        achievedWeight: rating / 5,
      };
    }
    
    return calculateRating(
      achieved, 
      kpi.target_value, 
      thresholds, 
      kpi.criteria || 'Higher is Better', 
      kpi.weightage || 0,
      uomType,
      kpi.qualitative_options as QualitativeOption[] | null,
      kpi.uom,
      kpi.threshold_mode || 'absolute'
    );
  };

  const handleAchievedChange = (value: string) => {
    setAchievedValue(value);
    if (selectedKpi && value) {
      const result = calculateScoreFromAchieved(parseFloat(value), selectedKpi);
      setCalculatedScore(result.rating);
      setCalculatedPercentage(result.percentage);
      setCalculatedRatingLevel(null);
    } else {
      setCalculatedScore(null);
      setCalculatedPercentage(null);
      setCalculatedRatingLevel(null);
    }
  };

  // Handle qualitative value change (binary/tiered)
  const handleQualitativeChange = (value: string, rating: number, ratingLevel: RatingLevel) => {
    setAchievedValue(value);
    setCalculatedScore(rating);
    setCalculatedRatingLevel(ratingLevel);
    setCalculatedPercentage(null);
  };

  const openReviewDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    
    // Check if this is an org-level KPI and get value based on scope
    const orgValue = getOrgKpiValue(kpi);
    
    // Reset sub-period selection
    setSelectedSubPeriod(null);
    
    // For Daily/Weekly KPIs, don't pre-fill from monthly submission
    const needsSubPeriod = requiresSubPeriodSelection(kpi.frequency as FrequencyType);
    
    if (!needsSubPeriod) {
      // Pre-fill with org value if available, otherwise use existing submission
      const prefilledValue = orgValue?.achieved_value ?? existing?.achieved_value;
      
      if (prefilledValue !== null && prefilledValue !== undefined) {
        // For qualitative KPIs, achieved_value might be a string label stored as text
        if (isQualitativeKpi(kpi)) {
          // Try to find the matching option
          const options = kpi.uom_type === 'binary' 
            ? [{ label: 'Yes', rating: 5 }, { label: 'No', rating: 0 }]
            : (kpi.qualitative_options as QualitativeOption[] | null) || [];
          const matchedOption = options.find(o => 
            o.label === prefilledValue.toString() || o.rating === prefilledValue
          );
          if (matchedOption) {
            setAchievedValue(matchedOption.label);
            setCalculatedScore(matchedOption.rating);
            setCalculatedRatingLevel(scoreToRatingLevel(matchedOption.rating) as RatingLevel);
            setCalculatedPercentage(null);
          } else {
            setAchievedValue('');
            setCalculatedScore(null);
            setCalculatedRatingLevel(null);
            setCalculatedPercentage(null);
          }
        } else {
          setAchievedValue(prefilledValue.toString());
          const result = calculateScoreFromAchieved(prefilledValue, kpi);
          setCalculatedScore(result.rating);
          setCalculatedPercentage(result.percentage);
          setCalculatedRatingLevel(null);
        }
      } else {
        setAchievedValue('');
        setCalculatedScore(null);
        setCalculatedPercentage(null);
        setCalculatedRatingLevel(null);
      }
    } else {
      // For sub-period KPIs, start fresh (will be filled when sub-period is selected)
      setAchievedValue('');
      setCalculatedScore(null);
      setCalculatedPercentage(null);
      setCalculatedRatingLevel(null);
    }
    
    setSelfRemarks(existing?.self_remarks || '');
    // Support both new array and legacy single URL
    const existingUrls = (existing as any)?.self_evidence_urls;
    setSelfEvidenceUrls(Array.isArray(existingUrls) && existingUrls.length > 0 
      ? existingUrls 
      : existing?.self_evidence_url ? [existing.self_evidence_url] : []);
    setIsNa(existing?.is_na || false);
    setReviewDialogOpen(true);
  };

  // Helper to get current sub-period submission details
  const getCurrentSubPeriodSubmission = (): SubPeriodSubmission | undefined => {
    if (!selectedKpi || !selectedSubPeriod) return undefined;
    return subPeriodSubmissions?.find(
      s => s.kpi_id === selectedKpi.id && s.sub_period_value === selectedSubPeriod
    );
  };

  // Handle sub-period selection change
  const handleSubPeriodChange = (value: string) => {
    setSelectedSubPeriod(value);
    setResubmitReason(''); // Reset resubmit reason when changing period
    
    // Look up existing submission for this sub-period
    if (selectedKpi) {
      const existingSubPeriod = subPeriodSubmissions?.find(
        s => s.kpi_id === selectedKpi.id && s.sub_period_value === value
      );
      
      if (existingSubPeriod?.achieved_value !== null && existingSubPeriod?.achieved_value !== undefined) {
        setAchievedValue(existingSubPeriod.achieved_value.toString());
        const result = calculateScoreFromAchieved(existingSubPeriod.achieved_value, selectedKpi);
        setCalculatedScore(result.rating);
        setCalculatedPercentage(result.percentage);
        setSelfRemarks(existingSubPeriod.remarks || '');
      } else {
        setAchievedValue('');
        setCalculatedScore(null);
        setCalculatedPercentage(null);
        setSelfRemarks('');
      }
    }
  };

  const openTimeline = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setTimelineOpen(true);
  };

  // Convert numeric score to rating level for storage
  const getRatingLevel = (score: number): RatingLevel => {
    if (score >= 4) return 'blue';
    if (score >= 3) return 'green';
    if (score >= 2) return 'yellow';
    return 'red';
  };

  // Handle monthly submission for Daily/Weekly KPIs
  const handleSubmitMonthlyReview = async () => {
    if (!selectedKpi) return;
    
    const kpiSubPeriods = getKpiSubPeriodSubmissions(selectedKpi.id);
    const values = kpiSubPeriods
      .filter(s => s.achieved_value !== null)
      .map(s => s.achieved_value as number);
    const isBinaryKpi = selectedKpi?.uom_type === 'binary';
    const aggregationResult = calculateDailyAggregatedScore(values, dailyAggregationMethod, selectedPeriod, selectedYear, isBinaryKpi);
    const aggregatedScore = aggregationResult.score;
    if (aggregatedScore === null) return;
    
    setIsSubmittingMonthly(true);
    
    try {
      // Calculate rating from aggregated score
      const result = calculateScoreFromAchieved(aggregatedScore, selectedKpi);
      const selfRating = getRatingLevel(result.rating);
      
      // Build remarks including aggregation method info
      const methodLabel = dailyAggregationMethod === 'missed_days_penalty' 
        ? `Missed Days Penalty (${aggregationResult.missedDays} missed)`
        : 'Average';
      const defaultRemarks = `${methodLabel}: Aggregated from ${kpiSubPeriods.length} ${selectedKpi.frequency?.toLowerCase()} entries`;
      
      // Submit to review_submissions and transition status
      await submitReview.mutateAsync({
        kpi_id: selectedKpi.id,
        achieved_value: aggregatedScore,
        self_rating: selfRating,
        self_score: result.rating,
        self_remarks: selfRemarks || defaultRemarks,
        self_evidence_url: selfEvidenceUrls.length > 0 ? selfEvidenceUrls[0] : null,
        is_na: false,
      });
      
      setShowMonthlySubmitConfirm(false);
      setReviewDialogOpen(false);
    } finally {
      setIsSubmittingMonthly(false);
    }
  };

  // Confirm resubmission and proceed with the actual save
  const handleConfirmResubmit = () => {
    if (pendingResubmitReason.trim()) {
      setResubmitReason(pendingResubmitReason.trim());
      setShowResubmitConfirm(false);
      setPendingResubmitReason('');
      // Now actually submit with the reason
      performSubPeriodSubmit(pendingResubmitReason.trim(), true);
    }
  };

  const handleCancelResubmitConfirm = () => {
    setShowResubmitConfirm(false);
    setPendingResubmitReason('');
  };

  // Perform the actual sub-period submission
  const performSubPeriodSubmit = async (updateReason: string | null, isResubmission: boolean) => {
    if (!selectedKpi || !selectedSubPeriod) return;
    
    await submitSubPeriod.mutateAsync({
      kpi_id: selectedKpi.id,
      sub_period_type: selectedKpi.frequency === 'Daily' ? 'daily' : 'weekly',
      sub_period_value: selectedSubPeriod,
      achieved_value: isNa ? null : (isQualitativeKpi(selectedKpi) ? calculatedScore : safeParseFloat(achievedValue)),
      remarks: selfRemarks || null,
      evidence_url: selfEvidenceUrls.length > 0 ? selfEvidenceUrls[0] : null,
      review_month: selectedPeriod,
      review_year: selectedYear,
      update_reason: updateReason,
      is_resubmission: isResubmission,
    });
    
    // Reset sub-period for next entry or close dialog
    setSelectedSubPeriod(null);
    setAchievedValue('');
    setCalculatedScore(null);
    setSelfRemarks('');
    setResubmitReason('');
    // Don't close dialog - allow continuing to enter more sub-periods
  };

  const handleSubmitReview = async () => {
    if (!selectedKpi) return;
    
    const needsSubPeriod = requiresSubPeriodSelection(selectedKpi.frequency as FrequencyType);
    
    // For sub-period KPIs, submit to sub_period_submissions
    if (needsSubPeriod && selectedSubPeriod) {
      const existingSubmission = getCurrentSubPeriodSubmission();
      const isExistingSubmission = !!existingSubmission;
      const isAlreadyResubmitted = existingSubmission?.is_resubmitted || false;
      const requiresReason = selectedKpi.require_resubmit_reason !== false; // Default to true
      
      // If already resubmitted (final), don't allow further edits
      if (isAlreadyResubmitted) {
        return; // Should already be blocked by UI
      }
      
      // If this is a resubmission and KPI requires reason, show confirmation dialog
      if (isExistingSubmission && requiresReason) {
        setShowResubmitConfirm(true);
        return;
      }
      
      // Otherwise, submit directly (first submission or reason not required)
      await performSubPeriodSubmit(null, isExistingSubmission);
      return;
    }
    
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

    // For qualitative KPIs, use the calculated rating level directly
    const selfRating = isNa 
      ? null 
      : isQualitativeKpi(selectedKpi) 
        ? calculatedRatingLevel 
        : (calculatedScore !== null ? getRatingLevel(calculatedScore) : null);

    await submitReview.mutateAsync({
      kpi_id: selectedKpi.id,
      achieved_value: isNa ? null : (isQualitativeKpi(selectedKpi) ? calculatedScore : (safeParseFloat(achievedValue) ?? 0)),
      self_rating: selfRating,
      self_score: isNa ? null : calculatedScore,
      self_remarks: selfRemarks,
      self_evidence_url: selfEvidenceUrls.length > 0 ? selfEvidenceUrls[0] : null,
      is_na: isNa,
    });

    setReviewDialogOpen(false);
  };
  
  // Check if a KPI is locked for the current period (multi-month cycles)
  const isKpiFrequencyLocked = (kpi: KPI): boolean => {
    return isKpiLockedForPeriod(
      kpi.frequency as FrequencyType, 
      selectedPeriod, 
      selectedYear, 
      kpi.frequency_cycle_start
    );
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
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Total KPIs</p>
                <p className="text-xl sm:text-3xl font-bold">{metrics.total}</p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-xl sm:text-3xl font-bold text-yellow-600">{metrics.pending}</p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-xl sm:text-3xl font-bold text-green-600">{metrics.approved}</p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Avg. Rating</p>
                <p className="text-xl sm:text-3xl font-bold text-blue-600">{metrics.avgRating.toFixed(2)}</p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress & Category Breakdown */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                KPI Details
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {sortedKpis.length} KPIs {selectedCategory ? 'in selected category' : 'found'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!isMobile && <KpiSortControl sortConfig={sortConfig} onSortChange={setSort} />}
              {selectedCategory && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)}>
                  Clear filter
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {isMobile ? (
            <div className="space-y-3">
              {sortedKpis.map(kpi => {
                const submission = submissionMap.get(kpi.id);
                const isLocked = isKpiFrequencyLocked(kpi);
                return (
                  <MobileKpiCard
                    key={kpi.id}
                    kpi={kpi}
                    submission={submission}
                    viewType="my-kpis"
                    onAction={openReviewDialog}
                    onView={openReviewDialog}
                    onShowLogic={openTimeline}
                    isLocked={isLocked}
                    onToggleExpand={toggleExpand}
                    isExpanded={expandedKpis.has(kpi.id)}
                    getOrgKpiValue={getOrgKpiValue}
                  />
                );
              })}
              {sortedKpis.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No KPIs found for this period
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <KpiDetailsTable
                kpis={sortedKpis}
                submissionMap={submissionMap}
                viewType="my-kpis"
                selectedPeriod={selectedPeriod}
                selectedYear={selectedYear}
                onReview={openReviewDialog}
                onView={openReviewDialog}
                onShowLogic={openTimeline}
                expandedKpis={expandedKpis}
                onToggleExpand={toggleExpand}
                getOrgKpiValue={getOrgKpiValue}
                isKpiLocked={isKpiFrequencyLocked}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Self Review Sheet - Compact No-Scroll Layout */}
      <Sheet open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <SheetContent className="flex flex-col h-full w-full sm:w-[85vw] sm:max-w-[1200px] overflow-y-auto p-4 sm:p-6">
          {(() => {
            // Compute org-level state for the selected KPI (at KPI level now)
            const isSelectedKpiOrgLevel = selectedKpi?.is_org_level || false;
            const selectedKpiOrgValue = isSelectedKpiOrgLevel && selectedKpi
              ? orgKpiValuesMap.get(`${selectedKpi.category_id}||${selectedKpi.kra_name}||${selectedKpi.kpi_name}`)
              : null;
            const hasOrgData = isSelectedKpiOrgLevel && selectedKpiOrgValue?.achieved_value != null;
            const isKraSet = selectedKpi?.status === 'kra_set';
            
            // Check if this KPI requires sub-period selection (Daily/Weekly)
            const needsSubPeriodForKpi = selectedKpi ? requiresSubPeriodSelection(selectedKpi.frequency as FrequencyType) : false;
            // Note: selectedKpiSubPeriods and aggregatedSubPeriodScore are computed at component level
            
            // Check if read-only mode (submitted KPIs should be view-only)
            const isReadOnly = !isKraSet;
            
            return (
              <>
                {/* Header */}
                <SheetHeader className="pb-2 sm:pb-3 border-b flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="text-base sm:text-lg">
                        {isReadOnly ? 'View KPI Details' : 'Submit Self Review'}
                      </SheetTitle>
                      {isReadOnly && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1 text-xs">
                          <Eye className="h-3 w-3" />
                          Read Only
                        </Badge>
                      )}
                    </div>
                    <Badge className={`${statusColors[selectedKpi?.status || 'kra_set']} text-xs`}>
                      {statusLabels[selectedKpi?.status || 'kra_set']}
                    </Badge>
                  </div>
                </SheetHeader>
                
                {/* Main Content with Scroll */}
                <div className="flex-1 overflow-y-auto py-3 sm:py-4 space-y-4 sm:space-y-6">
                  {/* KPI Review Panel - Shows header, metrics, history, journey */}
                  {selectedKpi && (
                    <KpiReviewPanel
                      kpi={selectedKpi}
                      submission={submissionMap.get(selectedKpi.id) || null}
                      allKpis={allKpis || []}
                      allSubmissions={allSubmissions || []}
                      viewLevel="employee"
                      currentUserId={profile?.id}
                      selectedPeriod={selectedPeriod}
                      selectedYear={selectedYear}
                      onOpenFullHistory={() => setTrackerModalOpen(true)}
                      onOpenTimeline={() => setTimelineOpen(true)}
                    />
                  )}
                  
                  {/* Daily Submission Summary - Show for Daily KPIs */}
                  {selectedKpi?.frequency === 'Daily' && selectedKpiSubPeriods.length > 0 && (
                    <DailySubmissionSummary
                      kpiId={selectedKpi.id}
                      reviewMonth={selectedPeriod}
                      reviewYear={selectedYear}
                      submissions={selectedKpiSubPeriods}
                      uom={selectedKpi.uom}
                      uomType={selectedKpi.uom_type}
                      qualitativeOptions={selectedKpi.qualitative_options as QualitativeOption[] | null}
                      kpiStatus={selectedKpi.status}
                    />
                  )}
                  
                  {/* Self Assessment Form - Only in edit mode */}
                  {!isReadOnly && selectedKpi && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileCheck className="h-4 w-4" />
                          Your Assessment
                        </CardTitle>
                        <CardDescription>
                          Enter your achieved value and provide justification
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Sub-Period Selection for Daily/Weekly KPIs */}
                        {needsSubPeriodForKpi && (
                          <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                <span className="font-medium text-purple-800 dark:text-purple-200">
                                  {selectedKpi.frequency} KPI
                                </span>
                                <span className="text-purple-600 dark:text-purple-400">
                                  - Submit data for each {selectedKpi.frequency === 'Daily' ? 'day' : 'week'}
                                </span>
                              </div>
                              {selectedKpiSubPeriods.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {selectedKpiSubPeriods.length} entries | Avg: {aggregatedSubPeriodScore?.toFixed(1) ?? '—'}
                                </Badge>
                              )}
                            </div>
                            <SubPeriodSelector
                              frequency={selectedKpi.frequency as FrequencyType}
                              reviewMonth={selectedPeriod}
                              reviewYear={selectedYear}
                              selectedSubPeriod={selectedSubPeriod}
                              onSubPeriodChange={handleSubPeriodChange}
                              submissions={selectedKpiSubPeriods}
                            />
                          </div>
                        )}
                        
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
                          <Label htmlFor="is_na" className="cursor-pointer text-sm">
                            Mark as N/A (Not Applicable)
                            {hasOrgData && (
                              <span className="text-muted-foreground ml-1">(disabled for org data)</span>
                            )}
                          </Label>
                        </div>
                        
                        {/* Input Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Achieved Value */}
                          {!isNa && (
                            <div className="space-y-2">
                              {selectedKpi?.uom === 'Date' ? (
                                <DateCalendarInput
                                  value={achievedValue ? parseInt(achievedValue) : null}
                                  onChange={(day) => handleAchievedChange(day?.toString() || '')}
                                  reviewMonth={selectedPeriod}
                                  reviewYear={selectedYear}
                                  disabled={hasOrgData}
                                  label="Completion Date *"
                                />
                              ) : isQualitativeKpi(selectedKpi) ? (
                                <QualitativeValueInput
                                  uomType={selectedKpi?.uom_type as 'binary' | 'tiered'}
                                  qualitativeOptions={selectedKpi?.qualitative_options as QualitativeOption[] | null}
                                  value={achievedValue || null}
                                  onChange={handleQualitativeChange}
                                  disabled={hasOrgData}
                                  label="Achieved Value *"
                                />
                              ) : (
                                <>
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
                                    className={hasOrgData ? 'bg-muted cursor-not-allowed' : ''}
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
                                </>
                              )}
                              
                              {/* Calculated Rating Display */}
                              {!isNa && calculatedScore !== null && !isQualitativeKpi(selectedKpi) && (
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
                            </div>
                          )}
                          
                          {/* Remarks */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <Label htmlFor="remarks" className="text-sm">
                                {isNa ? 'Reason for N/A *' : 'Justification'}
                              </Label>
                              {isNa && (
                                <span className={`text-xs ${selfRemarks.trim().length < 50 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {selfRemarks.trim().length}/50 min
                                </span>
                              )}
                            </div>
                            <Textarea
                              id="remarks"
                              value={selfRemarks}
                              onChange={(e) => setSelfRemarks(e.target.value)}
                              placeholder={isNa ? 'Explain why this KPI is not applicable (minimum 50 characters)...' : 'Describe your achievements...'}
                              className={`resize-none min-h-[80px] ${isNa && selfRemarks.trim().length < 50 && selfRemarks.length > 0 ? 'border-destructive' : ''}`}
                            />
                            {isNa && selfRemarks.trim().length < 50 && selfRemarks.length > 0 && (
                              <p className="text-xs text-destructive">
                                {50 - selfRemarks.trim().length} more characters needed
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* Evidence Upload */}
                        {profile?.id && selectedKpi && (
                          <MultiFileUpload
                            userId={profile.id}
                            contextId={selectedKpi.id}
                            folder="self-evidence"
                            existingUrls={selfEvidenceUrls}
                            onUploadComplete={setSelfEvidenceUrls}
                            label="Evidence Attachments"
                          />
                        )}
                        
                        {isNa && (
                          <div className="p-3 border rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">
                              This KPI will be excluded from overall score calculations.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Read-Only View of Submitted Data */}
                  {isReadOnly && selectedKpi && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Submitted Data
                        </CardTitle>
                        <CardDescription>
                          Your submission is currently at "{statusLabels[selectedKpi?.status || 'self_review']}" stage
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selfRemarks && (
                          <div>
                            <Label className="text-sm mb-2 block">Justification</Label>
                            <div className="p-3 bg-muted/50 rounded-lg text-sm">
                              {selfRemarks}
                            </div>
                          </div>
                        )}
                        {selfEvidenceUrls.length > 0 && (
                          <div>
                            <Label className="text-sm mb-2 block">Evidence</Label>
                            {selfEvidenceUrls.map((url, idx) => (
                              <a 
                                key={idx}
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-primary underline hover:no-underline block"
                              >
                                View Evidence {selfEvidenceUrls.length > 1 ? idx + 1 : ''}
                              </a>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Footer - Fixed at bottom */}
                <SheetFooter className="pt-3 border-t flex-shrink-0">
                  <div className="flex items-center gap-2 w-full justify-between">
                    <Button variant="outline" size="sm" onClick={() => setReviewDialogOpen(false)}>
                      {isReadOnly ? 'Close' : (needsSubPeriodForKpi ? 'Done' : 'Cancel')}
                    </Button>
                    
                    {/* Only show action buttons in edit mode (not read-only) */}
                    {!isReadOnly && (
                      <div className="flex items-center gap-2">
                        {(() => {
                          // Check if current sub-period is already resubmitted (final)
                          const currentSubPeriodSubmission = needsSubPeriodForKpi && selectedSubPeriod && selectedKpi
                            ? subPeriodSubmissions?.find(s => s.kpi_id === selectedKpi.id && s.sub_period_value === selectedSubPeriod)
                            : null;
                          const isSubPeriodFinal = currentSubPeriodSubmission?.is_resubmitted || false;
                          
                          if (isSubPeriodFinal) {
                            return (
                              <Badge className="gap-1 bg-green-600 hover:bg-green-600 h-9 px-4">
                                <Lock className="h-3 w-3" />
                                Final - No Further Edits
                              </Badge>
                            );
                          }
                          
                          return (
                            <Button 
                              size="sm"
                              variant="secondary"
                              onClick={handleSubmitReview} 
                              disabled={
                                // For sub-period KPIs, need sub-period selected and value
                                (needsSubPeriodForKpi && (!selectedSubPeriod || (!isNa && !achievedValue))) ||
                                // For regular KPIs, need achieved value unless N/A
                                (!needsSubPeriodForKpi && !isNa && !achievedValue) || 
                                // N/A requires 50 char reason
                                (isNa && selfRemarks.trim().length < 50) || 
                                submitReview.isPending ||
                                submitSubPeriod.isPending
                              }
                            >
                              {(submitReview.isPending || submitSubPeriod.isPending) 
                                ? 'Saving...' 
                                : needsSubPeriodForKpi 
                                  ? (currentSubPeriodSubmission ? 'Update Entry' : 'Save Entry')
                                  : 'Submit'}
                            </Button>
                          );
                        })()}
                        
                        {/* Submit Month Button - Always visible for Daily/Weekly KPIs with tooltip states */}
                        {needsSubPeriodForKpi && (
                          <>
                            {subPeriodLoading ? (
                              <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading...
                              </Button>
                            ) : selectedKpiSubPeriods.length === 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
                                      <Send className="h-3 w-3" />
                                      Submit Month
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Enter at least one {selectedKpi?.frequency?.toLowerCase()} value first
                                </TooltipContent>
                              </Tooltip>
                            ) : selectedKpi?.status !== 'kra_set' ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
                                      <Send className="h-3 w-3" />
                                      Month Submitted
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  This KPI has already been submitted for the month
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Button 
                                size="sm"
                                onClick={() => setShowMonthlySubmitConfirm(true)}
                                className="gap-1"
                                disabled={isSubmittingMonthly}
                              >
                                <Send className="h-3 w-3" />
                                Submit Month
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
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

      {/* KPI Tracker Modal - Full History */}
      <KpiTrackerModal
        isOpen={trackerModalOpen}
        onClose={() => setTrackerModalOpen(false)}
        kpi={selectedKpi}
        allKpis={allKpis || []}
        submissions={allSubmissions || []}
      />

      {/* Resubmission Confirmation Dialog for Daily/Weekly KPIs */}
      <AlertDialog open={showResubmitConfirm} onOpenChange={(open) => !open && handleCancelResubmitConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Re-submit Data?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200">
                  <p className="font-medium">
                    You can update this record only once. It will be considered final and no further update will be allowed.
                  </p>
                </div>
                {selectedSubPeriod && (
                  <p>
                    Current submission for <strong>{selectedSubPeriod}</strong>:
                  </p>
                )}
                {(() => {
                  const existingSub = getCurrentSubPeriodSubmission();
                  if (!existingSub) return null;
                  return (
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p><strong>Current Value:</strong> {existingSub.achieved_value ?? '-'}</p>
                      {existingSub.submitted_at && (
                        <p><strong>Submitted On:</strong> {format(new Date(existingSub.submitted_at), 'dd MMM yyyy, hh:mm a')}</p>
                      )}
                      {existingSub.remarks && (
                        <p><strong>Remarks:</strong> {existingSub.remarks}</p>
                      )}
                    </div>
                  );
                })()}
                <div className="space-y-2 pt-2">
                  <Label htmlFor="resubmit-reason" className="text-foreground">
                    Reason for Update <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="resubmit-reason"
                    value={pendingResubmitReason}
                    onChange={(e) => setPendingResubmitReason(e.target.value)}
                    placeholder="Enter reason for modifying this submission..."
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    This reason will be logged for audit purposes.
                  </p>
                </div>
                <p className="text-sm font-medium text-foreground">
                  Are you sure you want to re-submit?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelResubmitConfirm}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmResubmit}
              disabled={!pendingResubmitReason.trim()}
            >
              Confirm & Re-submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Monthly Submission Confirmation Dialog for Daily/Weekly KPIs */}
      <AlertDialog open={showMonthlySubmitConfirm} onOpenChange={setShowMonthlySubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Submit Monthly Review
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Submit this {selectedKpi?.frequency} KPI for manager review?</p>
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Entries:</span>
                    <strong className="text-foreground">{selectedKpiSubPeriods.length}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average Score:</span>
                    <strong className="text-foreground">{aggregatedSubPeriodScore?.toFixed(2) ?? '—'}</strong>
                  </div>
                  {aggregatedSubPeriodScore !== null && selectedKpi && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rating:</span>
                      <Badge 
                        style={{ backgroundColor: scoreDisplay[Math.round(calculateScoreFromAchieved(aggregatedSubPeriodScore, selectedKpi).rating)]?.color || '#991B1B' }}
                        className="text-white"
                      >
                        {scoreDisplay[Math.round(calculateScoreFromAchieved(aggregatedSubPeriodScore, selectedKpi).rating)]?.label || 'Not Achieved'}
                      </Badge>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Once submitted, the KPI will move to your manager's review queue.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingMonthly}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSubmitMonthlyReview}
              disabled={isSubmittingMonthly || selectedKpiSubPeriods.length === 0}
            >
              {isSubmittingMonthly ? 'Submitting...' : 'Confirm & Submit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
