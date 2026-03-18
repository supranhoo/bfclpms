import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMyAuditAssignments } from '@/hooks/useAuditAssignments';
import { useMyKpiLevelAssignments } from '@/hooks/useMyKpiLevelAssignments';
import { AuditAssignmentDialog } from '@/components/admin/AuditAssignmentDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers, useProfiles, useSkipLevelTeamMembers, useProfilesByWorkflowStage } from '@/hooks/useOrganization';
import { useKpisByPeriodRanges, KPI } from '@/hooks/useKpis';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { useBulkEmployeeWorkflows } from '@/hooks/useWorkflowConfig';
import { resolvePendingStatuses, resolveReviewableStatuses, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ReviewPeriodSelectorEnhanced, type PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';
import { EmployeeFilters } from '@/components/review/EmployeeFilters';
import { EmployeeContactCard } from '@/components/review/EmployeeContactCard';
import { supabase } from '@/integrations/supabase/client';
import { formatEmployeeName } from '@/lib/utils';
import { Users, CheckCircle2, Clock, ArrowRight, Target, Shield, Briefcase, FileCheck, UserCheck, ClipboardCheck, Settings2 } from 'lucide-react';
import { ViewMode } from './ViewModeToggle';

interface EmployeeProfile {
  id: string;
  full_name: string | null;
  email: string;
  designation: string | null;
  employee_code: string | null;
  avatar_url: string | null;
  department_id: string | null;
  reporting_manager_id: string | null;
  pms_grade?: string | null;
  mobile_number?: string | null;
  relationship?: 'direct' | 'indirect';
  departments?: { id: string; name: string; code: string | null } | null;
}

interface EmployeeSelectorGridProps {
  viewLevel: Exclude<ViewMode, 'self'>;
  periodSelection: PeriodSelection;
  onPeriodSelectionChange: (selection: PeriodSelection) => void;
  onSelectEmployee: (employee: EmployeeProfile, autoOpenKpiId?: string | null) => void;
}

// Status options per view level
const STATUS_OPTIONS_BY_LEVEL: Record<Exclude<ViewMode, 'self'>, Array<{ value: string; label: string }>> = {
  team: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending_direct', label: 'Pending (Direct)' },
    { value: 'pending_skip', label: 'Pending (Skip-Level)' },
    { value: 'reviewed', label: 'Reviewed' },
  ],
  skip_level: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'Pending Skip-Level Review' },
    { value: 'reviewed', label: 'Reviewed' },
  ],
  hr_pms: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'Pending HR PMS Review' },
    { value: 'in_review', label: 'In HR PMS Review' },
    { value: 'reviewed', label: 'Reviewed' },
  ],
  audit: [
    { value: 'all', label: 'All Employees' },
    { value: 'my_assigned', label: 'My Assignments' },
    { value: 'pending', label: 'With Pending Audit' },
    { value: 'in_audit', label: 'In Audit' },
    { value: 'forwarded', label: 'Forwarded' },
  ],
  management: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'With Pending Reviews' },
    { value: 'approved', label: 'Approved' },
  ],
};

// Header config per view level
const HEADER_CONFIG: Record<Exclude<ViewMode, 'self'>, { icon: React.ElementType; title: string; description: string; gradient: string }> = {
  team: { 
    icon: Users, 
    title: 'Team Reviews', 
    description: "Review direct & indirect reports' performance",
    gradient: 'from-blue-500 to-indigo-600'
  },
  skip_level: { 
    icon: UserCheck, 
    title: 'Team Reviews', 
    description: 'Review as skip-level reporting manager',
    gradient: 'from-teal-500 to-cyan-600'
  },
  hr_pms: { 
    icon: ClipboardCheck, 
    title: 'HR PMS Review', 
    description: 'HR PMS team review and assessment',
    gradient: 'from-rose-500 to-pink-600'
  },
  audit: { 
    icon: Shield, 
    title: 'Audit Panel', 
    description: 'Review and verify performance evaluations',
    gradient: 'from-purple-500 to-indigo-600'
  },
  management: { 
    icon: Briefcase, 
    title: 'Management Review', 
    description: 'Final review and approval of performance evaluations',
    gradient: 'from-emerald-500 to-teal-600'
  },
};

export function EmployeeSelectorGrid({
  viewLevel,
  periodSelection,
  onPeriodSelectionChange,
  onSelectEmployee,
}: EmployeeSelectorGridProps) {
  const { user, effectiveRole: role } = useAuth();
  const { data: teamMembers, isLoading: teamLoading } = useTeamMembers(user?.id);
  const { data: allProfiles, isLoading: profilesLoading } = useProfiles();
  // Fetch skip-level members for team view (merged) or standalone skip_level view
  const { data: skipLevelMembers, isLoading: skipLevelLoading } = useSkipLevelTeamMembers(
    (viewLevel === 'team' || viewLevel === 'skip_level') ? user?.id : undefined
  );

  // Map each reviewer panel to the workflow stage it requires employees to have
  const PANEL_REQUIRED_STAGE: Partial<Record<Exclude<ViewMode, 'self'>, string>> = {
    hr_pms: 'hr_pms_review',
    audit: 'audit',
    management: 'management_review',
    skip_level: 'skip_level_check',
  };
  const requiredStage = PANEL_REQUIRED_STAGE[viewLevel] ?? null;

  // Fetch only employees whose resolved workflow template includes the required stage
  const selectedPeriodForFilter = periodSelection.selectedMonth;
  const selectedYearForFilter = periodSelection.selectedYear;
  const { data: stageFilteredProfiles, isLoading: stageFilteredLoading } = useProfilesByWorkflowStage(requiredStage, selectedPeriodForFilter, selectedYearForFilter);

  const { departments, designations, grades, managers } = useEmployeeFilterOptions();
  const [searchParams] = useSearchParams();
  const autoOpenKpiId = searchParams.get('kpi');

  // Derived values from period selection
  const selectedPeriod = periodSelection.selectedMonth;
  const selectedYear = periodSelection.selectedYear;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedDesignation, setSelectedDesignation] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);

  // Audit assignments: fetch current user's assigned employees
  const { data: myAssignedEmployeeIds } = useMyAuditAssignments();
  const { data: myKpiLevelData } = useMyKpiLevelAssignments();

  // Fix 1 & 3: Use multi-period hook so YTD/QTD/custom modes fetch ALL relevant months
  const { data: periodKpis } = useKpisByPeriodRanges(periodSelection.periodRanges);

  // Determine which employees to show based on view level and role
  const isFullAccess = role === 'admin' || role === 'auditor' || role === 'management' || role === 'hr_pms';

  // Fix 2: Derive employee IDs from the full visible list, not just periodKpis.
  // This ensures workflowMap has stages for ALL panel employees, not only those with KPIs in the selected range.
  const allEmployeeIds = useMemo(() => {
    const source = requiredStage ? stageFilteredProfiles : (isFullAccess ? allProfiles : teamMembers);
    if (!source) return [];
    return source.map((p: { id: string }) => p.id);
  }, [requiredStage, stageFilteredProfiles, isFullAccess, allProfiles, teamMembers]);

  const { data: workflowMap } = useBulkEmployeeWorkflows(allEmployeeIds, selectedPeriod, selectedYear);

  // Helper: get workflow stages for an employee (with fallback)
  const getStages = (employeeId: string): string[] => {
    return workflowMap?.get(employeeId) || DEFAULT_WORKFLOW_STAGES;
  };

  // Helper: map viewLevel to workflow engine's viewLevel format
  const getEngineViewLevel = (forRelationship?: 'direct' | 'indirect'): 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms' => {
    // In merged team view, indirect reports use skip_level engine level
    if (viewLevel === 'team' && forRelationship === 'indirect') return 'skip_level';
    const map: Record<string, 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms'> = {
      team: 'manager',
      skip_level: 'skip_level',
      hr_pms: 'hr_pms',
      audit: 'auditor',
      management: 'management',
    };
    return map[viewLevel] || 'manager';
  };

  // isLoading accounts for stage-filtered fetch when a required stage is active
  const isLoading = viewLevel === 'team'
    ? (isFullAccess ? profilesLoading : (teamLoading || skipLevelLoading))
    : requiredStage
      ? stageFilteredLoading
      : (isFullAccess ? profilesLoading : teamLoading);

  // Build merged base members with relationship tags for team view
  const baseMembers: EmployeeProfile[] | undefined = useMemo(() => {
    if (viewLevel === 'team') {
      if (isFullAccess) {
        // Admin/auditor/management see all profiles; tag based on reporting chain
        const skipIds = new Set(skipLevelMembers?.map(m => m.id) || []);
        const directIds = new Set(teamMembers?.map(m => m.id) || []);
        return allProfiles?.map(p => ({
          ...p,
          relationship: (skipIds.has(p.id) ? 'indirect' : directIds.has(p.id) ? 'direct' : undefined) as 'direct' | 'indirect' | undefined,
        }));
      }
      // Manager: merge direct + indirect
      const directSet = new Set(teamMembers?.map(m => m.id) || []);
      const directTagged = (teamMembers || []).map(m => ({ ...m, relationship: 'direct' as const }));
      const indirectTagged = (skipLevelMembers || []).filter(m => !directSet.has(m.id)).map(m => ({ ...m, relationship: 'indirect' as const }));
      return [...directTagged, ...indirectTagged];
    }
    // For reviewer panels (hr_pms, audit, management, skip_level):
    // Only show employees whose resolved workflow template includes the required stage.
    if (requiredStage) return (stageFilteredProfiles as EmployeeProfile[] | undefined) || [];
    // Fallback for any other full-access panel
    if (isFullAccess) return allProfiles;
    return teamMembers;
  }, [viewLevel, teamMembers, skipLevelMembers, allProfiles, isFullAccess, requiredStage, stageFilteredProfiles]);

  // Auto-open KPI from URL
  useEffect(() => {
    if (!autoOpenKpiId || !allProfiles) return;

    (async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select('employee_id, review_period, review_year')
        .eq('id', autoOpenKpiId)
        .maybeSingle();

      if (error || !data) return;

      const targetEmployee = allProfiles.find(p => p.id === data.employee_id);
      if (targetEmployee) {
        if (data.review_period || data.review_year) {
          onPeriodSelectionChange({
            ...periodSelection,
            selectedMonth: data.review_period || periodSelection.selectedMonth,
            selectedYear: data.review_year || periodSelection.selectedYear,
            months: [data.review_period || periodSelection.selectedMonth],
            periodRanges: [{ month: data.review_period || periodSelection.selectedMonth, year: data.review_year || periodSelection.selectedYear }]
          });
        }
        onSelectEmployee(targetEmployee, autoOpenKpiId);
      }
    })();
  }, [autoOpenKpiId, allProfiles]);

  // Get employee KPI stats using workflow-aware resolution
  const getEmployeeKpiStats = (employeeId: string, relationship?: 'direct' | 'indirect') => {
    if (!periodKpis) return { badge1: 0, badge2: 0, badge3: 0, total: 0, clearedKraSet: 0 };
    const empKpis = periodKpis.filter(k => k.employee_id === employeeId);
    const clearedKraSet = empKpis.filter(k => k.status !== 'kra_set').length;
    const stages = getStages(employeeId);

    if (viewLevel === 'team') {
      const isIndirect = relationship === 'indirect';
      if (isIndirect) {
        const reviewable = resolveReviewableStatuses('skip_level', stages);
        const slIdx = stages.indexOf('skip_level_check');
        const doneStatuses = slIdx >= 0 ? stages.slice(slIdx) : [];
        return {
          badge1: empKpis.filter(k => reviewable.includes(k.status || '')).length,
          badge2: empKpis.filter(k => !['kra_set', 'self_review'].includes(k.status || '')).length,
          badge3: 0,
          total: empKpis.length,
          clearedKraSet,
        };
      }
      return {
        badge1: empKpis.filter(k => k.status === 'self_review').length,
        badge2: empKpis.filter(k => !['kra_set', 'self_review'].includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
        clearedKraSet,
      };
    } else if (viewLevel === 'skip_level') {
      const reviewable = resolveReviewableStatuses('skip_level', stages);
      const slIdx = stages.indexOf('skip_level_check');
      const doneStatuses = slIdx >= 0 ? stages.slice(slIdx) : [];
      return {
        badge1: empKpis.filter(k => reviewable.includes(k.status || '')).length,
        badge2: empKpis.filter(k => doneStatuses.includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
        clearedKraSet,
      };
    } else if (viewLevel === 'hr_pms') {
      const reviewable = resolveReviewableStatuses('hr_pms', stages);
      const hrIdx = stages.indexOf('hr_pms_review');
      const doneStatuses = hrIdx >= 0 ? stages.slice(hrIdx + 1) : [];
      return {
        badge1: empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'hr_pms_review').length,
        badge2: empKpis.filter(k => k.status === 'hr_pms_review').length,
        badge3: empKpis.filter(k => doneStatuses.includes(k.status || '')).length,
        total: empKpis.length,
        clearedKraSet,
      };
    } else if (viewLevel === 'audit') {
      const reviewable = resolveReviewableStatuses('auditor', stages);
      return {
        badge1: empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'audit').length,
        badge2: empKpis.filter(k => k.status === 'audit').length,
        badge3: empKpis.filter(k => ['management_review', 'approved'].includes(k.status || '')).length,
        total: empKpis.length,
        clearedKraSet,
      };
    } else {
      const pending = empKpis.filter(k => k.status === 'management_review').length;
      const approved = empKpis.filter(k => k.status === 'approved').length;
      const inPipeline = empKpis.length - pending - approved;
      return {
        badge1: pending,
        badge2: approved,
        badge3: inPipeline,
        total: empKpis.length,
        clearedKraSet,
      };
    }
  };

  // Demographic filtering (search, department, designation, grade, manager) — used for stats
  const demographicFilteredMembers = useMemo(() => {
    let filtered = baseMembers?.filter(p => 
      p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (selectedDepartment) {
      filtered = filtered?.filter(p => p.department_id === selectedDepartment);
    }
    if (selectedDesignation) {
      filtered = filtered?.filter(p => p.designation === selectedDesignation);
    }
    if (selectedGrade) {
      filtered = filtered?.filter(p => p.pms_grade === selectedGrade);
    }
    if (selectedManager) {
      filtered = filtered?.filter(p => p.reporting_manager_id === selectedManager);
    }

    return filtered;
  }, [baseMembers, searchQuery, selectedDepartment, selectedDesignation, selectedGrade, selectedManager]);

  // Filter members further by status for display
  const displayMembers = useMemo(() => {
    let filtered = demographicFilteredMembers ? [...demographicFilteredMembers] : undefined;

    // Status-based filtering using per-employee workflow resolution
    if (statusFilter === 'my_assigned' && viewLevel === 'audit') {
      filtered = filtered?.filter(m => 
        (myAssignedEmployeeIds instanceof Set && myAssignedEmployeeIds.has(m.id)) ||
        (myKpiLevelData?.allAssignedEmployeeIds?.has(m.id))
      );
    } else if (statusFilter !== 'all' && statusFilter !== 'my_assigned' && periodKpis) {
      const employeeIds = new Set<string>();
      // For merged team view, build skip-level member set for relationship detection
      const skipIds = viewLevel === 'team' ? new Set(skipLevelMembers?.map(m => m.id) || []) : new Set<string>();
      
      periodKpis.forEach(kpi => {
        const stages = getStages(kpi.employee_id);
        const isIndirect = skipIds.has(kpi.employee_id);
        const engineLevel = viewLevel === 'team' && isIndirect ? 'skip_level' as const : getEngineViewLevel();
        const reviewableStatuses = resolveReviewableStatuses(engineLevel, stages);
        
        if (viewLevel === 'team') {
          if (statusFilter === 'pending_direct' && !isIndirect && kpi.status === 'self_review') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'pending_skip' && isIndirect && reviewableStatuses.includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed') {
            if (!isIndirect && !['kra_set', 'self_review'].includes(kpi.status || '')) {
              employeeIds.add(kpi.employee_id);
            } else if (isIndirect) {
              const slIdx = stages.indexOf('skip_level_check');
              if (slIdx >= 0 && stages.slice(slIdx).includes(kpi.status || '')) {
                employeeIds.add(kpi.employee_id);
              }
            }
          }
        } else if (viewLevel === 'audit') {
          if (statusFilter === 'pending' && reviewableStatuses.includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'in_audit' && kpi.status === 'audit') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'forwarded' && ['management_review', 'approved'].includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          }
        } else if (viewLevel === 'skip_level') {
          if (statusFilter === 'pending' && reviewableStatuses.includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed') {
            const slIdx = stages.indexOf('skip_level_check');
            if (slIdx >= 0) {
              const doneStatuses = stages.slice(slIdx);
              if (doneStatuses.includes(kpi.status || '')) employeeIds.add(kpi.employee_id);
            }
          }
        } else if (viewLevel === 'hr_pms') {
          if (statusFilter === 'pending' && reviewableStatuses.includes(kpi.status || '') && kpi.status !== 'hr_pms_review') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'in_review' && kpi.status === 'hr_pms_review') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed') {
            const hrIdx = stages.indexOf('hr_pms_review');
            if (hrIdx >= 0) {
              const afterHr = stages.slice(hrIdx + 1);
              if (afterHr.includes(kpi.status || '')) employeeIds.add(kpi.employee_id);
            }
          }
        } else if (viewLevel === 'management') {
          if (statusFilter === 'pending' && kpi.status === 'management_review') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'approved' && kpi.status === 'approved') {
            employeeIds.add(kpi.employee_id);
          }
        }
      });
      
      filtered = filtered?.filter(m => employeeIds.has(m.id));
    }

    // Auto-sort by urgency: most pending KPIs first
    filtered?.sort((a, b) => {
      const statsA = getEmployeeKpiStats(a.id, a.relationship);
      const statsB = getEmployeeKpiStats(b.id, b.relationship);
      // Employees with 0 KPIs sink to bottom
      if (statsA.total === 0 && statsB.total > 0) return 1;
      if (statsB.total === 0 && statsA.total > 0) return -1;
      // Most pending first
      if (statsB.badge1 !== statsA.badge1) return statsB.badge1 - statsA.badge1;
      // More total KPIs = higher priority
      if (statsB.total !== statsA.total) return statsB.total - statsA.total;
      // Alphabetical fallback
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    return filtered;
  }, [demographicFilteredMembers, statusFilter, periodKpis, viewLevel, workflowMap, skipLevelMembers, myAssignedEmployeeIds, myKpiLevelData]);

  // Split display members into assigned/others for audit view
  const { assignedMembers, otherMembers } = useMemo(() => {
    const employeeLevelSet = (myAssignedEmployeeIds instanceof Set) ? myAssignedEmployeeIds : new Set<string>();
    const kpiLevelSet = myKpiLevelData?.allAssignedEmployeeIds || new Set<string>();
    const hasAnyAssignments = employeeLevelSet.size > 0 || kpiLevelSet.size > 0;

    if (viewLevel !== 'audit' || !hasAnyAssignments || statusFilter === 'my_assigned') {
      return { assignedMembers: [], otherMembers: displayMembers || [] };
    }
    const assigned: EmployeeProfile[] = [];
    const others: EmployeeProfile[] = [];
    (displayMembers || []).forEach(m => {
      if (employeeLevelSet.has(m.id) || kpiLevelSet.has(m.id)) assigned.push(m);
      else others.push(m);
    });
    return { assignedMembers: assigned, otherMembers: others };
  }, [displayMembers, viewLevel, myAssignedEmployeeIds, myKpiLevelData, statusFilter]);

  // Calculate stats using per-employee workflow-aware resolution
  const stats = useMemo(() => {
    if (!periodKpis || !demographicFilteredMembers) {
      return { totalEmployees: 0, stat1: 0, stat2: 0, stat3: 0, stat4: 0, totalKpis: 0 };
    }

    const memberIds = new Set(demographicFilteredMembers.map(m => m.id));
    const relevantKpis = periodKpis.filter(k => memberIds.has(k.employee_id));
    const skipIds = new Set(skipLevelMembers?.map(m => m.id) || []);

    if (viewLevel === 'team') {
      // Merged view: separate direct pending, skip-level pending, and reviewed counts
      let directPending = 0, skipPending = 0, reviewed = 0;
      relevantKpis.forEach(k => {
        const isIndirect = skipIds.has(k.employee_id);
        if (isIndirect) {
          const stages = getStages(k.employee_id);
          const reviewable = resolveReviewableStatuses('skip_level', stages);
          if (reviewable.includes(k.status || '')) skipPending++;
          else {
            const slIdx = stages.indexOf('skip_level_check');
            if (slIdx >= 0 && stages.slice(slIdx).includes(k.status || '')) reviewed++;
          }
        } else {
          if (k.status === 'self_review') directPending++;
          else if (!['kra_set', 'self_review'].includes(k.status || '')) reviewed++;
        }
      });
      return {
        totalEmployees: demographicFilteredMembers.length,
        stat1: directPending,
        stat2: skipPending,
        stat3: reviewed,
        stat4: relevantKpis.length,
        totalKpis: relevantKpis.length,
      };
    } else if (viewLevel === 'audit') {
      let pending = 0, inAudit = 0, forwarded = 0;
      relevantKpis.forEach(k => {
        const stages = getStages(k.employee_id);
        const reviewable = resolveReviewableStatuses('auditor', stages);
        if (reviewable.includes(k.status || '') && k.status !== 'audit') pending++;
        else if (k.status === 'audit') inAudit++;
        else if (['management_review', 'approved'].includes(k.status || '')) forwarded++;
      });
      return { totalEmployees: demographicFilteredMembers.length, stat1: pending, stat2: inAudit, stat3: forwarded, stat4: 0, totalKpis: relevantKpis.length };
    } else if (viewLevel === 'skip_level') {
      let pending = 0, reviewed = 0;
      relevantKpis.forEach(k => {
        const stages = getStages(k.employee_id);
        const reviewable = resolveReviewableStatuses('skip_level', stages);
        if (reviewable.includes(k.status || '')) pending++;
        else {
          const slIdx = stages.indexOf('skip_level_check');
          if (slIdx >= 0 && stages.slice(slIdx).includes(k.status || '')) reviewed++;
        }
      });
      return { totalEmployees: demographicFilteredMembers.length, stat1: pending, stat2: reviewed, stat3: relevantKpis.length, stat4: 0, totalKpis: relevantKpis.length };
    } else if (viewLevel === 'hr_pms') {
      let pending = 0, inReview = 0, forwarded = 0;
      relevantKpis.forEach(k => {
        const stages = getStages(k.employee_id);
        const reviewable = resolveReviewableStatuses('hr_pms', stages);
        if (reviewable.includes(k.status || '') && k.status !== 'hr_pms_review') pending++;
        else if (k.status === 'hr_pms_review') inReview++;
        else {
          const hrIdx = stages.indexOf('hr_pms_review');
          if (hrIdx >= 0) {
            const afterHr = stages.slice(hrIdx + 1);
            if (afterHr.includes(k.status || '')) forwarded++;
          }
        }
      });
      return { totalEmployees: demographicFilteredMembers.length, stat1: pending, stat2: inReview, stat3: forwarded, stat4: 0, totalKpis: relevantKpis.length };
    } else {
      return {
        totalEmployees: baseMembers.length,
        stat1: relevantKpis.filter(k => k.status === 'management_review').length,
        stat2: relevantKpis.filter(k => k.status === 'approved').length,
        stat3: relevantKpis.length,
        stat4: 0,
        totalKpis: relevantKpis.length,
      };
    }
  }, [periodKpis, baseMembers, viewLevel, workflowMap, skipLevelMembers]);

  // Smart period detection: auto-switch to a period with KPIs if current period has none
  const handleEmployeeClick = async (member: EmployeeProfile) => {
    const empKpis = periodKpis?.filter(k => k.employee_id === member.id) || [];
    
    if (empKpis.length > 0) {
      // Employee has KPIs in the currently selected period
      onSelectEmployee(member);
      return;
    }

    // No KPIs in current period — find the most recent period with KPIs
    const { data, error } = await supabase
      .from('kpis')
      .select('review_period, review_year')
      .eq('employee_id', member.id)
      .order('review_year', { ascending: false })
      .order('review_period', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.review_period && data?.review_year) {
      onPeriodSelectionChange({
        ...periodSelection,
        selectedMonth: data.review_period,
        selectedYear: data.review_year,
        months: [data.review_period],
        periodRanges: [{ month: data.review_period, year: data.review_year }],
      });
    }

    onSelectEmployee(member);
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId || !allProfiles) return null;
    const mgr = allProfiles.find(p => p.id === managerId);
    if (!mgr) return null;
    return formatEmployeeName(mgr.full_name, mgr.email, mgr.employee_code);
  };

  const headerConfig = HEADER_CONFIG[viewLevel];
  const HeaderIcon = headerConfig.icon;
  const statusOptions = STATUS_OPTIONS_BY_LEVEL[viewLevel];

  // Render stats cards based on view level
  const toggleStatusFilter = (filter: string) => {
    setStatusFilter(prev => prev === filter ? 'all' : filter);
  };

  const renderStatsCards = () => {
    if (viewLevel === 'team') {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard icon={Users} label={isFullAccess ? 'Total Employees' : 'Team Size'} value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Direct Pending" value={stats.stat1} color="yellow" subtitle="Awaiting manager review" onClick={() => toggleStatusFilter('pending_direct')} active={statusFilter === 'pending_direct'} />
          <StatCard icon={UserCheck} label="Skip-Level Pending" value={stats.stat2} color="amber" subtitle="Awaiting skip-level review" onClick={() => toggleStatusFilter('pending_skip')} active={statusFilter === 'pending_skip'} />
          <StatCard icon={CheckCircle2} label="Reviewed" value={stats.stat3} color="green" subtitle="KPIs completed" onClick={() => toggleStatusFilter('reviewed')} active={statusFilter === 'reviewed'} />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" className="col-span-2 md:col-span-1" />
        </div>
      );
    } else if (viewLevel === 'skip_level') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Pending Review" value={stats.stat1} color="amber" subtitle="Awaiting skip-level check" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard icon={CheckCircle2} label="Reviewed" value={stats.stat2} color="green" subtitle="Skip-level completed" onClick={() => toggleStatusFilter('reviewed')} active={statusFilter === 'reviewed'} />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" />
        </div>
      );
    } else if (viewLevel === 'hr_pms') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Pending Review" value={stats.stat1} color="amber" subtitle="Awaiting HR PMS review" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard icon={FileCheck} label="In Review" value={stats.stat2} color="purple" subtitle="Currently in HR PMS" onClick={() => toggleStatusFilter('in_review')} active={statusFilter === 'in_review'} />
          <StatCard icon={CheckCircle2} label="Reviewed" value={stats.stat3} color="green" subtitle="HR PMS completed" onClick={() => toggleStatusFilter('reviewed')} active={statusFilter === 'reviewed'} />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" />
        </div>
      );
    } else if (viewLevel === 'audit') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Pending Audit" value={stats.stat1} color="amber" subtitle="KPIs awaiting audit" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard icon={FileCheck} label="In Audit" value={stats.stat2} color="purple" subtitle="Currently reviewing" onClick={() => toggleStatusFilter('in_audit')} active={statusFilter === 'in_audit'} />
          <StatCard icon={CheckCircle2} label="Forwarded" value={stats.stat3} color="green" subtitle="Sent for management" onClick={() => toggleStatusFilter('forwarded')} active={statusFilter === 'forwarded'} />
          <StatCard icon={Target} label="My KPIs" value={myKpiLevelData?.totalAssignedKpis || 0} color="blue" subtitle="KPIs assigned to you" onClick={() => toggleStatusFilter('my_assigned')} active={statusFilter === 'my_assigned'} />
        </div>
      );
    } else {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Pending Review" value={stats.stat1} color="emerald" subtitle="KPIs awaiting approval" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard icon={CheckCircle2} label="Approved" value={stats.stat2} color="green" subtitle="KPIs completed" onClick={() => toggleStatusFilter('approved')} active={statusFilter === 'approved'} />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" />
        </div>
      );
    }
  };

  // Compute progress bar segments from kpiStats based on view level
  const getProgressSegments = (kpiStats: { badge1: number; badge2: number; badge3: number; total: number; clearedKraSet: number }) => {
    // badge1 = pending, badge2 = in-progress or done (depends on level), badge3 = done (for 3-tier levels)
    if (viewLevel === 'hr_pms' || viewLevel === 'audit') {
      // 3-tier: badge3=done, badge2=in-progress, badge1=pending
      return { done: kpiStats.badge3, inProgress: kpiStats.badge2, total: kpiStats.total, clearedKraSet: kpiStats.clearedKraSet };
    }
    if (viewLevel === 'management') {
      return { done: kpiStats.badge2, inProgress: kpiStats.badge3, total: kpiStats.total, clearedKraSet: kpiStats.clearedKraSet };
    }
    // 2-tier: badge2=done, badge1=pending
    return { done: kpiStats.badge2, inProgress: 0, total: kpiStats.total, clearedKraSet: kpiStats.clearedKraSet };
  };

  // Render badge based on view level
  const renderEmployeeBadges = (member: EmployeeProfile) => {
    const kpiStats = getEmployeeKpiStats(member.id, member.relationship);
    
    if (kpiStats.total === 0) {
      return (
        <div className="mt-2">
          <Badge variant="outline" className="bg-muted text-muted-foreground border-muted text-xs">
            No KPIs
          </Badge>
        </div>
      );
    }

    const segments = getProgressSegments(kpiStats);

    const renderBadges = () => {
      if (viewLevel === 'team') {
        return (
          <>
            {member.relationship === 'indirect' && (
              <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-xs dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800">
                Indirect
              </Badge>
            )}
            {member.relationship === 'direct' && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                Direct
              </Badge>
            )}
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge2} reviewed
              </Badge>
            )}
          </>
        );
      } else if (viewLevel === 'skip_level') {
        return (
          <>
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-xs dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge2} reviewed
              </Badge>
            )}
          </>
        );
      } else if (viewLevel === 'hr_pms') {
        return (
          <>
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-xs dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {kpiStats.badge2} in review
              </Badge>
            )}
            {kpiStats.badge3 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge3} reviewed
              </Badge>
            )}
          </>
        );
      } else if (viewLevel === 'audit') {
        return (
          <>
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {kpiStats.badge2} in audit
              </Badge>
            )}
            {kpiStats.badge3 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge3} forwarded
              </Badge>
            )}
            {(() => {
              const kpiCount = myKpiLevelData?.assignedKpisByEmployee?.get(member.id)?.length;
              return kpiCount ? (
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300 text-xs dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-600">
                  {kpiCount} KPIs assigned to you
                </Badge>
              ) : null;
            })()}
          </>
        );
      } else {
        return (
          <>
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge3 > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                {kpiStats.badge3} in pipeline
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge2} approved
              </Badge>
            )}
          </>
        );
      }
    };

    return (
      <div className="space-y-2 mt-2 w-full">
        <EmployeeProgressBar done={segments.done} inProgress={segments.inProgress} total={segments.total} clearedKraSet={segments.clearedKraSet} />
        <div className="flex items-center gap-2 flex-wrap">
          {renderBadges()}
        </div>
      </div>
    );
  };

  const renderEmployeeCard = (member: EmployeeProfile) => {
    const managerName = getManagerName(member.reporting_manager_id);
    const isAssigned = viewLevel === 'audit' && (
      (myAssignedEmployeeIds instanceof Set && myAssignedEmployeeIds.has(member.id)) ||
      (myKpiLevelData?.allAssignedEmployeeIds?.has(member.id))
    );
    return (
      <Card
        key={member.id}
        className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group ${isAssigned ? 'ring-1 ring-primary/30 border-primary/20' : ''}`}
        onClick={() => handleEmployeeClick(member)}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={member.avatar_url || undefined} />
              <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                {isFullAccess ? (
                  <EmployeeContactCard
                    employee={member}
                    departmentName={(member as any).departments?.name ?? undefined}
                    onViewKpis={() => handleEmployeeClick(member)}
                  >
                    <span
                      className="font-medium truncate group-hover:text-primary transition-colors cursor-pointer hover:underline"
                      title="Click to view contact info"
                    >
                      {formatEmployeeName(member.full_name, member.email, member.employee_code)}
                    </span>
                  </EmployeeContactCard>
                ) : (
                  <p className="font-medium truncate group-hover:text-primary transition-colors">
                    {formatEmployeeName(member.full_name, member.email, member.employee_code)}
                  </p>
                )}
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-2" />
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {member.designation || member.email}
              </p>
              {isFullAccess && managerName && (
                <p className="text-xs text-muted-foreground truncate mt-1">
                  Manager: {managerName}
                </p>
              )}
              {renderEmployeeBadges(member)}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-12 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-to-br ${headerConfig.gradient} flex items-center justify-center`}>
            <HeaderIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{headerConfig.title}</h1>
            <p className="text-sm text-muted-foreground">{headerConfig.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {viewLevel === 'audit' && (
            <Button variant="outline" size="sm" onClick={() => setAssignmentDialogOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1.5" />
              Manage Assignments
            </Button>
          )}
          {/* Compact Period Selector */}
          <div className="p-2 sm:p-3 rounded-lg bg-muted/30 border border-border/50">
            <ReviewPeriodSelectorEnhanced
              value={periodSelection}
              onChange={onPeriodSelectionChange}
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {renderStatsCards()}

      {/* Filters */}
      <EmployeeFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDepartment={selectedDepartment}
        onDepartmentChange={setSelectedDepartment}
        departments={departments}
        selectedDesignation={selectedDesignation}
        onDesignationChange={setSelectedDesignation}
        designations={designations}
        selectedGrade={selectedGrade}
        onGradeChange={setSelectedGrade}
        grades={grades}
        selectedManager={selectedManager}
        onManagerChange={setSelectedManager}
        managers={managers}
        showManagerFilter={isFullAccess}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={statusOptions}
      />

      {/* Employees Grid */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">
            {isFullAccess ? 'All Employees' : 'Team Members'}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Select an employee to view their scorecard and review KPIs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayMembers && displayMembers.length > 0 ? (
            <>
              {/* Audit grouped view: Assigned to Me + All Others */}
              {viewLevel === 'audit' && assignedMembers.length > 0 && statusFilter !== 'my_assigned' ? (
                <div className="space-y-6">
                  {/* Assigned Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="default" className="text-xs">
                        My Assignments ({assignedMembers.length})
                      </Badge>
                    </div>
                    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      {assignedMembers.map(member => renderEmployeeCard(member))}
                    </div>
                  </div>
                  {/* Separator */}
                  {otherMembers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline" className="text-xs">
                          All Others ({otherMembers.length})
                        </Badge>
                      </div>
                      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        {otherMembers.map(member => renderEmployeeCard(member))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {displayMembers.map(member => renderEmployeeCard(member))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">{isFullAccess ? 'No employees found' : 'No team members found'}</p>
              <p className="text-sm mt-1">
                {searchQuery || selectedDepartment || selectedDesignation || selectedGrade || selectedManager
                  ? 'Try adjusting your filters' 
                  : isFullAccess 
                    ? 'No employees in the system yet' 
                    : "You don't have any direct reports assigned"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Assignment Dialog */}
      {viewLevel === 'audit' && (
        <AuditAssignmentDialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen} />
      )}
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'primary' | 'purple' | 'yellow' | 'green' | 'blue' | 'amber' | 'emerald';
  subtitle?: string;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

const colorMap: Record<StatCardProps['color'], { border: string; bg: string; text: string }> = {
  primary: { border: 'border-l-primary', bg: 'bg-primary/10', text: 'text-primary' },
  purple: { border: 'border-l-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-600' },
  yellow: { border: 'border-l-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-600' },
  green: { border: 'border-l-green-500', bg: 'bg-green-500/10', text: 'text-green-600' },
  blue: { border: 'border-l-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-600' },
  amber: { border: 'border-l-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-600' },
  emerald: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
};

function StatCard({ icon: Icon, label, value, color, subtitle, className = '', onClick, active }: StatCardProps) {
  const colors = colorMap[color];
  const isClickable = !!onClick;
  
  return (
    <Card
      className={`border-l-4 ${colors.border} ${className} ${isClickable ? 'cursor-pointer transition-all hover:shadow-md' : ''} ${active ? 'ring-2 ring-primary shadow-md' : ''}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 sm:pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</p>
            <p className={`text-xl sm:text-3xl font-bold ${color === 'primary' ? '' : colors.text}`}>{value}</p>
            {subtitle && <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">{subtitle}</p>}
          </div>
          <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full ${colors.bg} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${colors.text}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Mini progress bar for employee cards
function EmployeeProgressBar({ done, inProgress, total, clearedKraSet }: { done: number; inProgress: number; total: number; clearedKraSet: number }) {
  if (total === 0) return null;
  const donePct = (done / total) * 100;
  const inProgressPct = (inProgress / total) * 100;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden flex flex-row">
        {donePct > 0 && (
          <div className="h-full bg-green-500 dark:bg-green-400" style={{ width: `${donePct}%` }} />
        )}
        {inProgressPct > 0 && (
          <div className="h-full bg-amber-400 dark:bg-amber-500" style={{ width: `${inProgressPct}%` }} />
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap font-medium">
        {clearedKraSet}/{total}
      </span>
    </div>
  );
}
