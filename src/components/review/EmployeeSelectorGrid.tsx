import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers, useProfiles, useSkipLevelTeamMembers, useProfilesByWorkflowStage } from '@/hooks/useOrganization';
import { useKpisByPeriodRanges, KPI } from '@/hooks/useKpis';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { useBulkEmployeeWorkflows } from '@/hooks/useWorkflowConfig';
import { resolvePendingStatuses, resolveReviewableStatuses, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ReviewPeriodSelectorEnhanced, type PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';
import { EmployeeFilters } from '@/components/review/EmployeeFilters';
import { EmployeeContactCard } from '@/components/review/EmployeeContactCard';
import { supabase } from '@/integrations/supabase/client';
import { Users, CheckCircle2, Clock, ArrowRight, Target, Shield, Briefcase, FileCheck, UserCheck, ClipboardCheck } from 'lucide-react';
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
    { value: 'reviewed', label: 'Reviewed' },
  ],
  audit: [
    { value: 'all', label: 'All Employees' },
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
  const { data: stageFilteredProfiles, isLoading: stageFilteredLoading } = useProfilesByWorkflowStage(requiredStage);

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

  // Fix 1 & 3: Use multi-period hook so YTD/QTD/custom modes fetch ALL relevant months
  const { data: rawPeriodKpis } = useKpisByPeriodRanges(periodSelection.periodRanges);

  // v1.45.94: Exclude non-issued (draft/template) KPIs from all dashboard stats
  const periodKpis = useMemo(() => {
    return rawPeriodKpis?.filter(k => (k as any).is_issued !== false) || [];
  }, [rawPeriodKpis]);

  // Determine which employees to show based on view level and role
  const isFullAccess = role === 'admin' || role === 'auditor' || role === 'management' || role === 'hr_pms';

  // Fix 2: Derive employee IDs from the full visible list, not just periodKpis.
  // This ensures workflowMap has stages for ALL panel employees, not only those with KPIs in the selected range.
  const allEmployeeIds = useMemo(() => {
    const source = requiredStage ? stageFilteredProfiles : (isFullAccess ? allProfiles : teamMembers);
    if (!source) return [];
    return source.map((p: { id: string }) => p.id);
  }, [requiredStage, stageFilteredProfiles, isFullAccess, allProfiles, teamMembers]);

  const { data: workflowMap } = useBulkEmployeeWorkflows(allEmployeeIds);

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

  // Filter members based on search, department, designation, grade, manager, and status
  const displayMembers = useMemo(() => {
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

    // Status-based filtering using per-employee workflow resolution
    if (statusFilter !== 'all' && periodKpis) {
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
          if (statusFilter === 'pending' && reviewableStatuses.includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed') {
            const hrIdx = stages.indexOf('hr_pms_review');
            if (hrIdx >= 0) {
              const doneStatuses = stages.slice(hrIdx);
              if (doneStatuses.includes(kpi.status || '')) employeeIds.add(kpi.employee_id);
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

    return filtered;
  }, [baseMembers, searchQuery, selectedDepartment, selectedDesignation, selectedGrade, selectedManager, statusFilter, periodKpis, viewLevel, workflowMap, skipLevelMembers]);

  // Calculate stats using per-employee workflow-aware resolution
  const stats = useMemo(() => {
    if (!periodKpis || !baseMembers) {
      return { totalEmployees: 0, stat1: 0, stat2: 0, stat3: 0, stat4: 0, totalKpis: 0 };
    }

    const memberIds = new Set(baseMembers.map(m => m.id));
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
        totalEmployees: baseMembers.length,
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
      return { totalEmployees: baseMembers.length, stat1: pending, stat2: inAudit, stat3: forwarded, stat4: 0, totalKpis: relevantKpis.length };
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
      return { totalEmployees: baseMembers.length, stat1: pending, stat2: reviewed, stat3: relevantKpis.length, stat4: 0, totalKpis: relevantKpis.length };
    } else if (viewLevel === 'hr_pms') {
      let pending = 0, reviewed = 0;
      relevantKpis.forEach(k => {
        const stages = getStages(k.employee_id);
        const reviewable = resolveReviewableStatuses('hr_pms', stages);
        if (reviewable.includes(k.status || '')) pending++;
        else {
          const hrIdx = stages.indexOf('hr_pms_review');
          if (hrIdx >= 0 && stages.slice(hrIdx).includes(k.status || '')) reviewed++;
        }
      });
      return { totalEmployees: baseMembers.length, stat1: pending, stat2: reviewed, stat3: relevantKpis.length, stat4: 0, totalKpis: relevantKpis.length };
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

  // Get employee KPI stats using workflow-aware resolution
  const getEmployeeKpiStats = (employeeId: string, relationship?: 'direct' | 'indirect') => {
    if (!periodKpis) return { badge1: 0, badge2: 0, badge3: 0, total: 0 };
    const empKpis = periodKpis.filter(k => k.employee_id === employeeId);
    const stages = getStages(employeeId);

    if (viewLevel === 'team') {
      const isIndirect = relationship === 'indirect';
      if (isIndirect) {
        const reviewable = resolveReviewableStatuses('skip_level', stages);
        const slIdx = stages.indexOf('skip_level_check');
        const doneStatuses = slIdx >= 0 ? stages.slice(slIdx) : [];
        return {
          badge1: empKpis.filter(k => reviewable.includes(k.status || '')).length,
          badge2: empKpis.filter(k => doneStatuses.includes(k.status || '')).length,
          badge3: 0,
          total: empKpis.length,
        };
      }
      return {
        badge1: empKpis.filter(k => k.status === 'self_review').length,
        badge2: empKpis.filter(k => !['kra_set', 'self_review'].includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
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
      };
    } else if (viewLevel === 'hr_pms') {
      const reviewable = resolveReviewableStatuses('hr_pms', stages);
      const hrIdx = stages.indexOf('hr_pms_review');
      const doneStatuses = hrIdx >= 0 ? stages.slice(hrIdx) : [];
      return {
        badge1: empKpis.filter(k => reviewable.includes(k.status || '')).length,
        badge2: empKpis.filter(k => doneStatuses.includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
      };
    } else if (viewLevel === 'audit') {
      const reviewable = resolveReviewableStatuses('auditor', stages);
      return {
        badge1: empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'audit').length,
        badge2: empKpis.filter(k => k.status === 'audit').length,
        badge3: empKpis.filter(k => ['management_review', 'approved'].includes(k.status || '')).length,
        total: empKpis.length,
      };
    } else {
      return {
        badge1: empKpis.filter(k => k.status === 'management_review').length,
        badge2: empKpis.filter(k => k.status === 'approved').length,
        badge3: 0,
        total: empKpis.length,
      };
    }
  };

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
    return allProfiles.find(p => p.id === managerId)?.full_name || null;
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Pending Review" value={stats.stat1} color="amber" subtitle="Awaiting HR PMS review" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard icon={CheckCircle2} label="Reviewed" value={stats.stat2} color="green" subtitle="HR PMS completed" onClick={() => toggleStatusFilter('reviewed')} active={statusFilter === 'reviewed'} />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" />
        </div>
      );
    } else if (viewLevel === 'audit') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Pending Audit" value={stats.stat1} color="amber" subtitle="KPIs awaiting audit" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard icon={FileCheck} label="In Audit" value={stats.stat2} color="purple" subtitle="Currently reviewing" onClick={() => toggleStatusFilter('in_audit')} active={statusFilter === 'in_audit'} />
          <StatCard icon={CheckCircle2} label="Forwarded" value={stats.stat3} color="green" subtitle="Sent for management" onClick={() => toggleStatusFilter('forwarded')} active={statusFilter === 'forwarded'} />
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

  // Render badge based on view level
  const renderEmployeeBadges = (member: EmployeeProfile) => {
    const kpiStats = getEmployeeKpiStats(member.id, member.relationship);
    
    if (kpiStats.total === 0) {
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-muted text-xs">
          No KPIs
        </Badge>
      );
    }

    if (viewLevel === 'team') {
      return (
        <>
          {/* Relationship badge */}
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
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
              {kpiStats.badge2} reviewed
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
          {kpiStats.badge2 > 0 && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
              {kpiStats.badge2} approved
            </Badge>
          )}
        </>
      );
    }
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
        
        {/* Compact Period Selector */}
        <div className="p-2 sm:p-3 rounded-lg bg-muted/30 border border-border/50">
          <ReviewPeriodSelectorEnhanced
            value={periodSelection}
            onChange={onPeriodSelectionChange}
          />
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
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {displayMembers.map(member => {
                const managerName = getManagerName(member.reporting_manager_id);
                
                return (
                  <Card
                    key={member.id}
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
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
                                  {member.full_name || member.email}
                                </span>
                              </EmployeeContactCard>
                            ) : (
                              <p className="font-medium truncate group-hover:text-primary transition-colors">
                                {member.full_name || member.email}
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
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {renderEmployeeBadges(member)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
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
