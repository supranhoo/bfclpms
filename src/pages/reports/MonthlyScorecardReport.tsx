import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, Search, FileSpreadsheet, Users, Target, TrendingUp, FileText, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { generateBulkScorecardPdf, generateScorecardPdf } from '@/lib/pdfExport';
import { useSystemSettings } from '@/hooks/useSystemSettings';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const RATING_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function MonthlyScorecardReport() {
  const currentYear = new Date().getFullYear();
  const currentMonth = MONTHS[new Date().getMonth()];
  
  const [selectedPeriod, setSelectedPeriod] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: systemSettings } = useSystemSettings();
  const companyName = useMemo(() => {
    const setting = systemSettings?.find(s => s.setting_key === 'company_name');
    return (setting?.setting_value as string) || 'Performance Management System';
  }, [systemSettings]);

  // Fetch KPIs with submissions
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['scorecard-kpis', selectedPeriod, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          id,
          kpi_name,
          kra_name,
          weightage,
          target_value,
          employee_id,
          category_id,
          review_period,
          review_year,
          status
        `)
        .eq('review_period', selectedPeriod)
        .eq('review_year', parseInt(selectedYear));
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch submissions for these KPIs
  const { data: submissions, isLoading: submissionsLoading } = useQuery({
    queryKey: ['scorecard-submissions', kpis?.map(k => k.id)],
    queryFn: async () => {
      if (!kpis?.length) return [];
      
      const kpiIds = kpis.map(k => k.id);
      const batchSize = 100;
      const allSubmissions = [];
      
      for (let i = 0; i < kpiIds.length; i += batchSize) {
        const batch = kpiIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('review_submissions')
          .select('*')
          .in('kpi_id', batch);
        
        if (error) throw error;
        if (data) allSubmissions.push(...data);
      }
      
      return allSubmissions;
    },
    enabled: !!kpis?.length,
  });

  // Fetch profiles
  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['scorecard-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, designation, department_id');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch departments
  const { data: departments } = useQuery({
    queryKey: ['scorecard-departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['scorecard-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('kra_categories').select('id, name');
      if (error) throw error;
      return data || [];
    },
  });

  // Build employee scorecards
  const employeeScorecards = useMemo(() => {
    if (!kpis || !profiles || !submissions) return [];

    const profileMap = new Map(profiles.map(p => [p.id, p]));
    const deptMap = new Map(departments?.map(d => [d.id, d.name]) || []);
    const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || []);
    const submissionMap = new Map(submissions.map(s => [s.kpi_id, s]));

    // Group KPIs by employee
    const employeeKpis = new Map<string, typeof kpis>();
    kpis.forEach(kpi => {
      if (!employeeKpis.has(kpi.employee_id)) {
        employeeKpis.set(kpi.employee_id, []);
      }
      employeeKpis.get(kpi.employee_id)!.push(kpi);
    });

    // Build scorecards
    const scorecards = Array.from(employeeKpis.entries()).map(([employeeId, empKpis]) => {
      const profile = profileMap.get(employeeId);
      if (!profile) return null;

      let totalWeightage = 0;
      let weightedSelfScore = 0;
      let weightedManagerScore = 0;
      let weightedAuditorScore = 0;
      let weightedManagementScore = 0;
      let weightedFinalScore = 0;
      let completedKpis = 0;
      let approvedKpis = 0;

      const kpiDetails = empKpis.map(kpi => {
        const submission = submissionMap.get(kpi.id);
        const weight = kpi.weightage || 0;
        totalWeightage += weight;

        if (submission) {
          if (submission.self_score) {
            weightedSelfScore += (submission.self_score * weight);
          }
          if (submission.manager_score) {
            weightedManagerScore += (submission.manager_score * weight);
          }
          if (submission.auditor_score) {
            weightedAuditorScore += (submission.auditor_score * weight);
          }
          if (submission.management_score) {
            weightedManagementScore += (submission.management_score * weight);
          }
          if (submission.final_score) {
            weightedFinalScore += (submission.final_score * weight);
            completedKpis++;
          }
        }

        if (kpi.status === 'approved') {
          approvedKpis++;
        }

        return {
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          category: categoryMap.get(kpi.category_id) || 'Unknown',
          weightage: weight,
          target: kpi.target_value,
          selfScore: submission?.self_score,
          selfRating: submission?.self_rating,
          managerScore: submission?.manager_score,
          managerRating: submission?.manager_rating,
          auditorScore: submission?.auditor_score,
          auditorRating: submission?.auditor_rating,
          managementScore: submission?.management_score,
          managementRating: submission?.management_rating,
          finalScore: submission?.final_score,
          finalRating: submission?.final_rating,
          status: kpi.status,
        };
      });

      const avgSelf = totalWeightage > 0 ? weightedSelfScore / totalWeightage : 0;
      const avgManager = totalWeightage > 0 ? weightedManagerScore / totalWeightage : 0;
      const avgAuditor = totalWeightage > 0 ? weightedAuditorScore / totalWeightage : 0;
      const avgManagement = totalWeightage > 0 ? weightedManagementScore / totalWeightage : 0;
      const avgFinal = totalWeightage > 0 ? weightedFinalScore / totalWeightage : 0;

      return {
        employeeId,
        employeeName: profile.full_name || 'Unknown',
        employeeCode: profile.employee_code || '',
        designation: profile.designation || '',
        department: deptMap.get(profile.department_id || '') || 'Unknown',
        totalKpis: empKpis.length,
        completedKpis,
        approvedKpis,
        avgSelfScore: avgSelf,
        avgManagerScore: avgManager,
        avgAuditorScore: avgAuditor,
        avgManagementScore: avgManagement,
        avgFinalScore: avgFinal,
        kpiDetails,
      };
    }).filter(Boolean);

    return scorecards;
  }, [kpis, profiles, submissions, departments, categories]);

  // Filter by search
  const filteredScorecards = useMemo(() => {
    if (!searchTerm) return employeeScorecards;
    const term = searchTerm.toLowerCase();
    return employeeScorecards.filter(sc => 
      sc?.employeeName.toLowerCase().includes(term) ||
      sc?.employeeCode.toLowerCase().includes(term) ||
      sc?.department.toLowerCase().includes(term)
    );
  }, [employeeScorecards, searchTerm]);

  // Summary stats
  const stats = useMemo(() => {
    const scorecards = filteredScorecards.filter(Boolean);
    const totalEmployees = scorecards.length;
    const totalKpis = scorecards.reduce((sum, sc) => sum + (sc?.totalKpis || 0), 0);
    const totalApproved = scorecards.reduce((sum, sc) => sum + (sc?.approvedKpis || 0), 0);
    const avgFinal = totalEmployees > 0 
      ? scorecards.reduce((sum, sc) => sum + (sc?.avgFinalScore || 0), 0) / totalEmployees 
      : 0;

    return { totalEmployees, totalKpis, totalApproved, avgFinal };
  }, [filteredScorecards]);

  const handleExportExcel = () => {
    const exportData = filteredScorecards.filter(Boolean).map(sc => ({
      'Employee Code': sc?.employeeCode,
      'Employee Name': sc?.employeeName,
      'Designation': sc?.designation,
      'Department': sc?.department,
      'Total KPIs': sc?.totalKpis,
      'Approved KPIs': sc?.approvedKpis,
      'Avg Self Score': sc?.avgSelfScore?.toFixed(2),
      'Avg Manager Score': sc?.avgManagerScore?.toFixed(2),
      'Avg Auditor Score': sc?.avgAuditorScore?.toFixed(2),
      'Avg Management Score': sc?.avgManagementScore?.toFixed(2),
      'Avg Final Score': sc?.avgFinalScore?.toFixed(2),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Scorecard');
    XLSX.writeFile(wb, `Monthly_Scorecard_${selectedPeriod}_${selectedYear}.xlsx`);
  };

  const handleExportAllPdf = () => {
    const validScorecards = filteredScorecards.filter(Boolean) as NonNullable<typeof filteredScorecards[0]>[];
    if (validScorecards.length === 0) return;
    
    generateBulkScorecardPdf(validScorecards, {
      period: selectedPeriod,
      year: selectedYear,
      companyName,
    });
  };

  const handleExportSinglePdf = (scorecard: NonNullable<typeof filteredScorecards[0]>) => {
    generateScorecardPdf(scorecard, {
      period: selectedPeriod,
      year: selectedYear,
      companyName,
    });
  };

  const isLoading = kpisLoading || submissionsLoading || profilesLoading;

  const getRatingBadge = (rating: string | null) => {
    if (!rating) return null;
    return (
      <Badge className={RATING_COLORS[rating] || 'bg-muted text-muted-foreground'}>
        {rating.charAt(0).toUpperCase() + rating.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Scorecard Report"
        description={`Employee performance scorecards for ${selectedPeriod} ${selectedYear}`}
        backTo="/reports"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportAllPdf}>
              <FileText className="h-4 w-4" />
              PDF
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(month => (
                    <SelectItem key={month} value={month}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search employee or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total KPIs</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalKpis}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Approved KPIs</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalApproved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Final Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgFinal.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Scorecard Table */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Scorecards</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredScorecards.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No scorecard data available for {selectedPeriod} {selectedYear}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-center">KPIs</TableHead>
                    <TableHead className="text-center">Self</TableHead>
                    <TableHead className="text-center">Manager</TableHead>
                    <TableHead className="text-center">Auditor</TableHead>
                    <TableHead className="text-center">Mgmt</TableHead>
                    <TableHead className="text-center">Final</TableHead>
                    <TableHead className="text-center w-[60px]">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredScorecards.filter(Boolean).map((scorecard) => (
                    <TableRow key={scorecard?.employeeId}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{scorecard?.employeeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {scorecard?.employeeCode} • {scorecard?.designation}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{scorecard?.department}</TableCell>
                      <TableCell className="text-center">
                        <div className="text-sm">
                          {scorecard?.approvedKpis}/{scorecard?.totalKpis}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {scorecard?.avgSelfScore ? scorecard.avgSelfScore.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {scorecard?.avgManagerScore ? scorecard.avgManagerScore.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {scorecard?.avgAuditorScore ? scorecard.avgAuditorScore.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {scorecard?.avgManagementScore ? scorecard.avgManagementScore.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold">
                          {scorecard?.avgFinalScore ? scorecard.avgFinalScore.toFixed(2) : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => scorecard && handleExportSinglePdf(scorecard)}
                          title="Download PDF Scorecard"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
