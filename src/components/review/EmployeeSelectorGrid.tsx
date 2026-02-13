import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers, useProfiles, useSkipLevelTeamMembers } from '@/hooks/useOrganization';
import { useKpisByPeriod, KPI } from '@/hooks/useKpis';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ReviewPeriodSelectorEnhanced, type PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';
import { EmployeeFilters } from '@/components/review/EmployeeFilters';
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
    { value: 'pending', label: 'With Pending Reviews' },
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
    title: 'Team Review', 
    description: "Review and manage your team's performance",
    gradient: 'from-blue-500 to-indigo-600'
  },
  skip_level: { 
    icon: UserCheck, 
    title: 'Skip-Level Review', 
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
  const { user, role } = useAuth();
  const { data: teamMembers, isLoading: teamLoading } = useTeamMembers(user?.id);
  const { data: allProfiles, isLoading: profilesLoading } = useProfiles();
  const { data: skipLevelMembers, isLoading: skipLevelLoading } = useSkipLevelTeamMembers(
    viewLevel === 'skip_level' ? user?.id : undefined
  );
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

  const { data: periodKpis } = useKpisByPeriod(selectedPeriod, selectedYear);

  // Determine which employees to show based on view level and role
  const isFullAccess = role === 'admin' || role === 'auditor' || role === 'management' || role === 'hr_pms';
  const isLoading = viewLevel === 'skip_level' ? skipLevelLoading : (isFullAccess ? profilesLoading : teamLoading);
  const baseMembers = viewLevel === 'skip_level' ? skipLevelMembers
    : viewLevel === 'hr_pms' ? allProfiles
    : isFullAccess ? allProfiles
    : teamMembers;

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

    // Status-based filtering per view level
    if (statusFilter !== 'all' && periodKpis) {
      const employeeIds = new Set<string>();
      
      periodKpis.forEach(kpi => {
        if (viewLevel === 'team') {
          if (statusFilter === 'pending' && kpi.status === 'self_review') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed' && ['manager_check', 'audit', 'management_review', 'approved'].includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          }
        } else if (viewLevel === 'audit') {
          // For audit: pending includes both manager_check AND self_review
          // (employees with skip_manager workflow go directly from self_review to audit)
          if (statusFilter === 'pending' && (kpi.status === 'manager_check' || kpi.status === 'self_review')) {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'in_audit' && kpi.status === 'audit') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'forwarded' && ['management_review', 'approved'].includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          }
        } else if (viewLevel === 'skip_level') {
          if (statusFilter === 'pending' && kpi.status === 'manager_check') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed' && ['skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'].includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          }
        } else if (viewLevel === 'hr_pms') {
          if (statusFilter === 'pending' && kpi.status === 'skip_level_check') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed' && ['hr_pms_review', 'audit', 'management_review', 'approved'].includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
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
  }, [baseMembers, searchQuery, selectedDepartment, selectedDesignation, selectedGrade, selectedManager, statusFilter, periodKpis, viewLevel]);

  // Calculate stats based on view level
  const stats = useMemo(() => {
    if (!periodKpis || !baseMembers) {
      return { totalEmployees: 0, stat1: 0, stat2: 0, stat3: 0, totalKpis: 0 };
    }

    const memberIds = new Set(baseMembers.map(m => m.id));
    const relevantKpis = periodKpis.filter(k => memberIds.has(k.employee_id));

    if (viewLevel === 'team') {
      return {
        totalEmployees: baseMembers.length,
        stat1: relevantKpis.filter(k => k.status === 'kra_set').length,
        stat2: relevantKpis.filter(k => k.status === 'self_review').length,
        stat3: relevantKpis.filter(k => ['manager_check', 'audit', 'management_review', 'approved'].includes(k.status || '')).length,
        totalKpis: relevantKpis.length,
      };
    } else if (viewLevel === 'skip_level') {
      return {
        totalEmployees: baseMembers.length,
        stat1: relevantKpis.filter(k => k.status === 'manager_check').length,
        stat2: relevantKpis.filter(k => ['skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'].includes(k.status || '')).length,
        stat3: relevantKpis.length,
        totalKpis: relevantKpis.length,
      };
    } else if (viewLevel === 'hr_pms') {
      return {
        totalEmployees: baseMembers.length,
        stat1: relevantKpis.filter(k => k.status === 'skip_level_check').length,
        stat2: relevantKpis.filter(k => ['hr_pms_review', 'audit', 'management_review', 'approved'].includes(k.status || '')).length,
        stat3: relevantKpis.length,
        totalKpis: relevantKpis.length,
      };
    } else if (viewLevel === 'audit') {
      return {
        totalEmployees: baseMembers.length,
        stat1: relevantKpis.filter(k => k.status === 'manager_check' || k.status === 'self_review').length,
        stat2: relevantKpis.filter(k => k.status === 'audit').length,
        stat3: relevantKpis.filter(k => ['management_review', 'approved'].includes(k.status || '')).length,
        totalKpis: relevantKpis.length,
      };
    } else {
      return {
        totalEmployees: baseMembers.length,
        stat1: relevantKpis.filter(k => k.status === 'management_review').length,
        stat2: relevantKpis.filter(k => k.status === 'approved').length,
        stat3: relevantKpis.length,
        totalKpis: relevantKpis.length,
      };
    }
  }, [periodKpis, baseMembers, viewLevel]);

  // Get employee KPI stats based on view level
  const getEmployeeKpiStats = (employeeId: string) => {
    if (!periodKpis) return { badge1: 0, badge2: 0, badge3: 0, total: 0 };
    const empKpis = periodKpis.filter(k => k.employee_id === employeeId);

    if (viewLevel === 'team') {
      return {
        badge1: empKpis.filter(k => k.status === 'self_review').length,
        badge2: empKpis.filter(k => ['manager_check', 'audit', 'management_review', 'approved'].includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
      };
    } else if (viewLevel === 'skip_level') {
      return {
        badge1: empKpis.filter(k => k.status === 'manager_check').length,
        badge2: empKpis.filter(k => ['skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'].includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
      };
    } else if (viewLevel === 'hr_pms') {
      return {
        badge1: empKpis.filter(k => k.status === 'skip_level_check').length,
        badge2: empKpis.filter(k => ['hr_pms_review', 'audit', 'management_review', 'approved'].includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
      };
    } else if (viewLevel === 'audit') {
      return {
        badge1: empKpis.filter(k => k.status === 'manager_check' || k.status === 'self_review').length,
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
          <StatCard icon={Target} label="Open KPIs" value={stats.stat1} color="purple" subtitle="Not yet submitted" />
          <StatCard icon={Clock} label="Pending Review" value={stats.stat2} color="yellow" subtitle="Awaiting manager" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
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
  const renderEmployeeBadges = (employeeId: string) => {
    const kpiStats = getEmployeeKpiStats(employeeId);
    
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
                            <p className="font-medium truncate group-hover:text-primary transition-colors">
                              {member.full_name || member.email}
                            </p>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
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
                            {renderEmployeeBadges(member.id)}
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
