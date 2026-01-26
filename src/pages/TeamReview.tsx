import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers, useProfiles } from '@/hooks/useOrganization';
import { useKpisByPeriod } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { EmployeeScorecard } from '@/components/review/EmployeeScorecard';
import { supabase } from '@/integrations/supabase/client';
import { Users, CheckCircle2, Clock, ArrowRight, Search, Target, AlertCircle, User } from 'lucide-react';

export default function TeamReview() {
  const { user, role } = useAuth();
  const { data: teamMembers, isLoading: teamLoading } = useTeamMembers(user?.id);
  const { data: allProfiles, isLoading: profilesLoading } = useProfiles();
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [searchParams] = useSearchParams();
  const autoOpenKpiId = searchParams.get('kpi');

  // Fetch KPIs for stats calculation
  const { data: periodKpis } = useKpisByPeriod(selectedPeriod, selectedYear);

  const isAdmin = role === 'admin';
  const isManagement = role === 'management';
  const isLoading = isAdmin || isManagement ? profilesLoading : teamLoading;

  // For admin/management: show all employees
  // For managers: show only their direct reports
  const baseMembers = isAdmin || isManagement ? allProfiles : teamMembers;

  // Filter members by search
  const displayMembers = useMemo(() => {
    let filtered = baseMembers?.filter(p => 
      p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Filter by status if needed
    if (statusFilter !== 'all' && periodKpis) {
      const employeeIds = new Set<string>();
      periodKpis.forEach(kpi => {
        if (statusFilter === 'pending' && kpi.status === 'self_review') {
          employeeIds.add(kpi.employee_id);
        } else if (statusFilter === 'reviewed' && ['manager_check', 'audit', 'management_review', 'approved'].includes(kpi.status || '')) {
          employeeIds.add(kpi.employee_id);
        }
      });
      filtered = filtered?.filter(m => employeeIds.has(m.id));
    }

    return filtered;
  }, [baseMembers, searchQuery, statusFilter, periodKpis]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!periodKpis || !baseMembers) {
      return { totalEmployees: 0, openKpis: 0, pendingReview: 0, reviewed: 0, totalKpis: 0 };
    }

    // Filter KPIs to only those belonging to team members
    const memberIds = new Set(baseMembers.map(m => m.id));
    const teamKpis = periodKpis.filter(k => memberIds.has(k.employee_id));

    const openKpis = teamKpis.filter(k => k.status === 'kra_set').length;
    const pendingReview = teamKpis.filter(k => k.status === 'self_review').length;
    const reviewed = teamKpis.filter(k => ['manager_check', 'audit', 'management_review', 'approved'].includes(k.status || '')).length;

    return {
      totalEmployees: baseMembers.length,
      openKpis,
      pendingReview,
      reviewed,
      totalKpis: teamKpis.length,
    };
  }, [periodKpis, baseMembers]);

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
    if (!periodKpis) return { pending: 0, reviewed: 0, total: 0 };
    const empKpis = periodKpis.filter(k => k.employee_id === employeeId);
    return {
      pending: empKpis.filter(k => k.status === 'self_review').length,
      reviewed: empKpis.filter(k => ['manager_check', 'audit', 'management_review', 'approved'].includes(k.status || '')).length,
      total: empKpis.length,
    };
  };

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  // Show scorecard view when employee is selected
  if (selectedMember) {
    return (
      <EmployeeScorecard
        employee={selectedMember}
        selectedPeriod={selectedPeriod}
        selectedYear={selectedYear}
        onBack={() => setSelectedMember(null)}
        autoOpenKpiId={autoOpenKpiId}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Review</h1>
          <p className="text-muted-foreground">
            {isAdmin || isManagement ? 'View all employees and their performance' : "Review and manage your team's performance"}
          </p>
        </div>
        <ReviewPeriodSelector
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          onPeriodChange={setSelectedPeriod}
          onYearChange={setSelectedYear}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {isAdmin || isManagement ? 'Total Employees' : 'Team Size'}
                </p>
                <p className="text-3xl font-bold">{stats.totalEmployees}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Open KPIs</p>
                <p className="text-3xl font-bold text-purple-600">{stats.openKpis}</p>
                <p className="text-xs text-muted-foreground">Not yet submitted</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Target className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pendingReview}</p>
                <p className="text-xs text-muted-foreground">Awaiting manager</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reviewed</p>
                <p className="text-3xl font-bold text-green-600">{stats.reviewed}</p>
                <p className="text-xs text-muted-foreground">KPIs completed</p>
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
                <p className="text-sm font-medium text-muted-foreground">Total KPIs</p>
                <p className="text-3xl font-bold text-blue-600">{stats.totalKpis}</p>
                <p className="text-xs text-muted-foreground">This period</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Target className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            <SelectItem value="pending">With Pending Reviews</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Team Members Grid */}
      <Card>
        <CardHeader>
          <CardTitle>{isAdmin || isManagement ? 'All Employees' : 'Team Members'}</CardTitle>
          <CardDescription>
            Select an employee to view their scorecard and review KPIs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayMembers && displayMembers.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                          {(isAdmin || isManagement) && managerName && (
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              Manager: {managerName}
                            </p>
                          )}
                          {/* KPI Status Badges */}
                          <div className="flex items-center gap-2 mt-2">
                            {kpiStats.pending > 0 && (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">
                                {kpiStats.pending} pending
                              </Badge>
                            )}
                            {kpiStats.reviewed > 0 && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                                {kpiStats.reviewed} reviewed
                              </Badge>
                            )}
                            {kpiStats.total === 0 && (
                              <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">
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
              <p className="font-medium">{isAdmin || isManagement ? 'No employees found' : 'No team members found'}</p>
              <p className="text-sm mt-1">
                {searchQuery 
                  ? 'Try adjusting your search criteria' 
                  : isAdmin || isManagement 
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
