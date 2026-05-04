/**
 * Shared hook for review page state management
 * Reduces duplication across AuditPanel, ManagementReview, and TeamReview pages
 */

import { useState, useMemo } from 'react';
import { useAllKpis, useReviewSubmissions, useKpiQueries, RatingLevel, KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export interface ReviewDialogState {
  reviewDialogOpen: boolean;
  sendBackDialogOpen: boolean;
  logicModalOpen: boolean;
  selectedKpi: KPI | null;
  score: number | null;
  rating: RatingLevel | '';
  remarks: string;
  evidenceUrl: string | null;
  achievedValue: number | null;
  sendBackReason: string;
  sendBackTarget: string;
}

export interface UseReviewPageStateOptions {
  defaultStatusFilter: string;
  defaultSendBackTarget?: string;
}

export function useReviewPageState(options: UseReviewPageStateOptions) {
  const { defaultStatusFilter, defaultSendBackTarget = 'employee' } = options;
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();

  // Filter state
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter);
  const [searchQuery, setSearchQuery] = useState('');
  // POLICY §120: debounce the search term to avoid recomputing the period KPI
  // filter on every keystroke. The raw `searchQuery` still drives the input UI.
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Dialog state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [sendBackDialogOpen, setSendBackDialogOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // Selected KPI and form state
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [rating, setRating] = useState<RatingLevel | ''>('');
  const [remarks, setRemarks] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [achievedValue, setAchievedValue] = useState<number | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');
  const [sendBackTarget, setSendBackTarget] = useState<string>(defaultSendBackTarget);

  // Data fetching
  const { data: allKpis, isLoading } = useAllKpis();
  const kpiIds = allKpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const { data: queries } = useKpiQueries(kpiIds);

  // Build maps for efficient lookup
  const submissionMap = useMemo(() => {
    return new Map(submissions?.map(s => [s.kpi_id, s]));
  }, [submissions]);

  const queryMap = useMemo(() => {
    const map = new Map<string, KpiQuery[]>();
    queries?.forEach(q => {
      const existing = map.get(q.kpi_id) || [];
      map.set(q.kpi_id, [...existing, q]);
    });
    return map;
  }, [queries]);

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

  // Final filtered KPIs with all filters applied
  const filteredKpis = useMemo(() => {
    let filtered = periodFilteredKpis;
    
    if (selectedCategory) {
      filtered = filtered.filter(kpi => kpi.category_id === selectedCategory);
    }
    if (statusFilter) {
      filtered = filtered.filter(kpi => kpi.status === statusFilter);
    }
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
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
  }, [periodFilteredKpis, selectedCategory, statusFilter, debouncedSearch]);

  // Open review dialog with pre-populated data
  const openReviewDialog = (
    kpi: KPI,
    fieldPrefix: 'auditor' | 'manager' | 'management',
    fallbackPrefix?: 'manager' | 'auditor'
  ) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    
    const scoreField = `${fieldPrefix}_score` as keyof ReviewSubmission;
    const ratingField = `${fieldPrefix}_rating` as keyof ReviewSubmission;
    const remarksField = `${fieldPrefix}_remarks` as keyof ReviewSubmission;
    const evidenceField = `${fieldPrefix}_evidence_url` as keyof ReviewSubmission;
    const achievedField = `${fieldPrefix}_achieved_value` as keyof ReviewSubmission;

    let initialScore = existing?.[scoreField] as number | null;
    let initialRating = existing?.[ratingField] as RatingLevel | null;
    
    // Fallback to previous stage if no current value
    if (fallbackPrefix && !initialScore) {
      const fallbackScoreField = `${fallbackPrefix}_score` as keyof ReviewSubmission;
      const fallbackRatingField = `${fallbackPrefix}_rating` as keyof ReviewSubmission;
      initialScore = existing?.[fallbackScoreField] as number | null;
      initialRating = existing?.[fallbackRatingField] as RatingLevel | null;
    }

    setScore(initialScore ?? null);
    setRating(initialRating || '');
    setRemarks((existing?.[remarksField] as string) || '');
    setEvidenceUrl((existing?.[evidenceField] as string) || null);
    setAchievedValue((existing?.[achievedField] as number) ?? existing?.achieved_value ?? null);
    setReviewDialogOpen(true);
  };

  const openSendBackDialog = (kpi: KPI, defaultTarget?: string) => {
    setSelectedKpi(kpi);
    setSendBackReason('');
    setSendBackTarget(defaultTarget || defaultSendBackTarget);
    setSendBackDialogOpen(true);
  };

  const openLogicModal = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setLogicModalOpen(true);
  };

  const openViewDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setViewDialogOpen(true);
  };

  const closeDialogs = () => {
    setReviewDialogOpen(false);
    setSendBackDialogOpen(false);
    setLogicModalOpen(false);
    setViewDialogOpen(false);
  };

  const resetFormState = () => {
    setScore(null);
    setRating('');
    setRemarks('');
    setEvidenceUrl(null);
    setAchievedValue(null);
    setSendBackReason('');
  };

  return {
    // Filter state
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

    // Dialog state
    reviewDialogOpen,
    setReviewDialogOpen,
    sendBackDialogOpen,
    setSendBackDialogOpen,
    logicModalOpen,
    setLogicModalOpen,
    viewDialogOpen,
    setViewDialogOpen,

    // Form state
    selectedKpi,
    setSelectedKpi,
    score,
    setScore,
    rating,
    setRating,
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

    // Data
    allKpis,
    isLoading,
    periodFilteredKpis,
    filteredKpis,
    submissions,
    queries,
    submissionMap,
    queryMap,

    // Actions
    openReviewDialog,
    openSendBackDialog,
    openLogicModal,
    openViewDialog,
    closeDialogs,
    resetFormState,
  };
}
