import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProfiles } from '@/hooks/useOrganization';
import { useKpisByPeriod } from '@/hooks/useKpis';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { EmployeeFilters } from '@/components/review/EmployeeFilters';
import { ManagementScorecard } from '@/components/review/ManagementScorecard';
import { supabase } from '@/integrations/supabase/client';
import { Users, CheckCircle2, Clock, ArrowRight, Target, Briefcase } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Employees' },
  { value: 'pending', label: 'With Pending Reviews' },
  { value: 'approved', label: 'Approved' },
];

export default function ManagementReview() {
  const { data: allProfiles, isLoading: profilesLoading } = useProfiles();
  const { departments, designations, grades, managers } = useEmployeeFilterOptions();
  
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedDesignation, setSelectedDesignation] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [searchParams] = useSearchParams();
  const autoOpenKpiId = searchParams.get('kpi');

  const { data: periodKpis } = useKpisByPeriod(selectedPeriod, selectedYear);

  // Filter members
  const displayMembers = useMemo(() => {
    let filtered = allProfiles?.filter(p => 
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

    if (statusFilter !== 'all' && periodKpis) {
      const employeeIds = new Set<string>();
      periodKpis.forEach(kpi => {
        if (statusFilter === 'pending' && kpi.status === 'management_review') {
          employeeIds.add(kpi.employee_id);
        } else if (statusFilter === 'approved' && kpi.status === 'approved') {
          employeeIds.add(kpi.employee_id);
        }
      });
      filtered = filtered?.filter(m => employeeIds.has(m.id));
    }

    return filtered;
  }, [allProfiles, searchQuery, selectedDepartment, selectedDesignation, selectedGrade, selectedManager, statusFilter, periodKpis]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!periodKpis || !allProfiles) {
      return { totalEmployees: 0, pendingReview: 0, approved: 0, totalKpis: 0 };
    }

    return {
      totalEmployees: allProfiles.length,
      pendingReview: periodKpis.filter(k => k.status === 'management_review').length,
      approved: periodKpis.filter(k => k.status === 'approved').length,
      totalKpis: periodKpis.length,
    };
  }, [periodKpis, allProfiles]);

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
        setSelectedMember(targetEmployee);
        if (data.review_period) setSelectedPeriod(data.review_period);
        if (data.review_year) setSelectedYear(data.review_year);
      }
    })();
  }, [autoOpenKpiId, allProfiles]);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId || !allProfiles) return null;
    return allProfiles.find(p => p.id === managerId)?.full_name || null;
  };

  const getEmployeeKpiStats = (employeeId: string) => {
    if (!periodKpis) return { pending: 0, approved: 0, total: 0 };
    const empKpis = periodKpis.filter(k => k.employee_id === employeeId);
    return {
      pending: empKpis.filter(k => k.status === 'management_review').length,
      approved: empKpis.filter(k => k.status === 'approved').length,
      total: empKpis.length,
    };
  };

  if (profilesLoading) {
    return <ReviewPanelSkeleton />;
  }

  if (selectedMember) {
    return (
      <ManagementScorecard
        employee={selectedMember}
        selectedPeriod={selectedPeriod}
        selectedYear={selectedYear}
        onPeriodChange={setSelectedPeriod}
        onYearChange={setSelectedYear}
        onBack={() => setSelectedMember(null)}
        autoOpenKpiId={autoOpenKpiId}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Management Review</h1>
            <p className="text-sm text-muted-foreground">Final review and approval of performance evaluations</p>
          </div>
        </div>
        <ReviewPeriodSelector
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          onPeriodChange={setSelectedPeriod}
          onYearChange={setSelectedYear}
        />
      </div>

      {/* Stats Cards - 2 columns on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Total Employees</p>
                <p className="text-xl sm:text-3xl font-bold">{stats.totalEmployees}</p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Pending Review</p>
                <p className="text-xl sm:text-3xl font-bold text-emerald-600">{stats.pendingReview}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">KPIs awaiting approval</p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-xl sm:text-3xl font-bold text-green-600">{stats.approved}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">KPIs completed</p>
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
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Total KPIs</p>
                <p className="text-xl sm:text-3xl font-bold text-blue-600">{stats.totalKpis}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">This period</p>
              </div>
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Target className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
        showManagerFilter={true}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={STATUS_OPTIONS}
      />

      {/* Employees Grid */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">All Employees</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Select an employee to view their scorecard and complete management review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayMembers && displayMembers.length > 0 ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {displayMembers.map(member => {
                const managerName = getManagerName(member.reporting_manager_id);
                const kpiStats = getEmployeeKpiStats(member.id);
                
                return (
                  <Card
                    key={member.id}
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
                    onClick={() => setSelectedMember(member)}
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
                          {managerName && (
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              Manager: {managerName}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            {kpiStats.pending > 0 && (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                                {kpiStats.pending} pending
                              </Badge>
                            )}
                            {kpiStats.approved > 0 && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                {kpiStats.approved} approved
                              </Badge>
                            )}
                            {kpiStats.total === 0 && (
                              <Badge variant="outline" className="bg-muted text-muted-foreground border-muted text-xs">
                                No KPIs
                              </Badge>
                            )}
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
              <p className="font-medium">No employees found</p>
              <p className="text-sm mt-1">
                {searchQuery || selectedDepartment || selectedDesignation || selectedGrade || selectedManager
                  ? 'Try adjusting your filters' 
                  : 'No employees in the system yet'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
