import { useState, useMemo, useEffect } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, FileSpreadsheet, Users, Target, TrendingUp, FileText, Eye, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { generateBulkScorecardPdf, generateDetailedScorecardPdf, generateDetailedScorecardPdfBlob, EmployeeScorecard, KpiDetail } from '@/lib/pdfExport';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthlyTrendView } from '@/components/reports/MonthlyTrendView';

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
  const { canDownload } = useReportAccess();
  const canExport = canDownload('monthly-scorecard');
  const { getCompanyCode } = useCompanyFilter();
  const currentYear = new Date().getFullYear();
  const currentMonth = MONTHS[new Date().getMonth()];
  
  const [selectedPeriod, setSelectedPeriod] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [searchTerm, setSearchTerm] = useState('');
  const [previewScorecard, setPreviewScorecard] = useState<EmployeeScorecard | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'range'>('single');
  
  const { data: systemSettings } = useSystemSettings();
  const companyName = useMemo(() => {
    const setting = systemSettings?.find(s => s.setting_key === 'company_name');
    return (setting?.setting_value as string) || 'Performance Management System';
  }, [systemSettings]);

  // Generate PDF blob when preview is requested
  useEffect(() => {
    if (previewScorecard) {
      const blob = generateDetailedScorecardPdfBlob(previewScorecard, {
        period: selectedPeriod,
        year: selectedYear,
        companyName,
      });
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPdfBlobUrl(null);
    }
  }, [previewScorecard, selectedPeriod, selectedYear, companyName]);

  // Fetch KPIs with full details
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
          status,
          uom,
          criteria
        `)
        .eq('review_period', selectedPeriod)
        .eq('review_year', parseInt(selectedYear));
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch submissions with all review stage data
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
          .select(`
            kpi_id,
            achieved_value,
            self_score,
            self_rating,
            self_remarks,
            self_evidence_url,
            manager_score,
            manager_rating,
            manager_remarks,
            manager_evidence_url,
            skip_level_score,
            skip_level_rating,
            skip_level_remarks,
            hr_pms_score,
            hr_pms_rating,
            hr_pms_remarks,
            auditor_score,
            auditor_rating,
            auditor_remarks,
            auditor_evidence_url,
            management_score,
            management_rating,
            management_remarks,
            final_score,
            final_rating
          `)
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

  // Build employee scorecards with full detail
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
    const scorecards: EmployeeScorecard[] = Array.from(employeeKpis.entries()).map(([employeeId, empKpis]) => {
      const profile = profileMap.get(employeeId);
      if (!profile) return null;

      let totalWeightage = 0;
      let weightedSelfScore = 0;
      let weightedManagerScore = 0;
      let weightedSkipLevelScore = 0;
      let weightedHrPmsScore = 0;
      let weightedAuditorScore = 0;
      let weightedManagementScore = 0;
      let weightedFinalScore = 0;
      let completedKpis = 0;
      let approvedKpis = 0;
      
      // Track whether ANY KPI has data for each stage (Bug 3 better fix)
      let hasSelfData = false;
      let hasManagerData = false;
      let hasSkipLevelData = false;
      let hasHrPmsData = false;
      let hasAuditorData = false;
      let hasManagementData = false;

      const kpiDetails: KpiDetail[] = empKpis.map(kpi => {
        const submission = submissionMap.get(kpi.id);
        const weight = kpi.weightage || 0;
        totalWeightage += weight;

        if (submission) {
          if (submission.self_score != null) {
            weightedSelfScore += (submission.self_score * weight);
            hasSelfData = true;
          }
          if (submission.manager_score != null) {
            weightedManagerScore += (submission.manager_score * weight);
            hasManagerData = true;
          }
          if (submission.skip_level_score != null) {
            weightedSkipLevelScore += (submission.skip_level_score * weight);
            hasSkipLevelData = true;
          }
          if (submission.hr_pms_score != null) {
            weightedHrPmsScore += (submission.hr_pms_score * weight);
            hasHrPmsData = true;
          }
          if (submission.auditor_score != null) {
            weightedAuditorScore += (submission.auditor_score * weight);
            hasAuditorData = true;
          }
          if (submission.management_score != null) {
            weightedManagementScore += (submission.management_score * weight);
            hasManagementData = true;
          }
          if (submission.final_score != null) {
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
          uom: kpi.uom || '%',
          criteria: kpi.criteria || 'Higher is Better',
          
          selfAchieved: submission?.achieved_value,
          selfScore: submission?.self_score,
          selfRating: submission?.self_rating,
          selfRemarks: submission?.self_remarks,
          selfEvidence: submission?.self_evidence_url,
          
          managerScore: submission?.manager_score,
          managerRating: submission?.manager_rating,
          managerRemarks: submission?.manager_remarks,
          managerEvidence: submission?.manager_evidence_url,
          
          skipLevelScore: submission?.skip_level_score,
          skipLevelRating: submission?.skip_level_rating,
          skipLevelRemarks: submission?.skip_level_remarks,
          
          hrPmsScore: submission?.hr_pms_score,
          hrPmsRating: submission?.hr_pms_rating,
          hrPmsRemarks: submission?.hr_pms_remarks,
          
          auditorScore: submission?.auditor_score,
          auditorRating: submission?.auditor_rating,
          auditorRemarks: submission?.auditor_remarks,
          auditorEvidence: submission?.auditor_evidence_url,
          
          managementScore: submission?.management_score,
          managementRating: submission?.management_rating,
          managementRemarks: submission?.management_remarks,
          
          finalScore: submission?.final_score,
          finalRating: submission?.final_rating,
          status: kpi.status,
        };
      });

      const avgSelf = totalWeightage > 0 ? weightedSelfScore / totalWeightage : 0;
      const avgManager = totalWeightage > 0 ? weightedManagerScore / totalWeightage : 0;
      const avgSkipLevel = totalWeightage > 0 ? weightedSkipLevelScore / totalWeightage : 0;
      const avgHrPms = totalWeightage > 0 ? weightedHrPmsScore / totalWeightage : 0;
      const avgAuditor = totalWeightage > 0 ? weightedAuditorScore / totalWeightage : 0;
      const avgManagement = totalWeightage > 0 ? weightedManagementScore / totalWeightage : 0;
      const avgFinal = totalWeightage > 0 ? weightedFinalScore / totalWeightage : 0;

      // Calculate category metrics
      const categoryScores = new Map<string, { totalScore: number; totalWeight: number }>();
      kpiDetails.forEach(kpi => {
        if (!categoryScores.has(kpi.category)) {
          categoryScores.set(kpi.category, { totalScore: 0, totalWeight: 0 });
        }
        const cat = categoryScores.get(kpi.category)!;
        cat.totalWeight += kpi.weightage;
        cat.totalScore += (kpi.finalScore || 0) * kpi.weightage;
      });

      const categoryMetrics = Array.from(categoryScores.entries()).map(([name, data]) => ({
        name,
        percentage: data.totalWeight > 0 ? (data.totalScore / data.totalWeight / 5) * 100 : 0,
        weightage: data.totalWeight,
        score: data.totalWeight > 0 ? data.totalScore / data.totalWeight : 0,
      }));

      const deptName = deptMap.get(profile.department_id || '');

      return {
        employeeId,
        employeeName: profile.full_name || 'Unknown',
        employeeCode: profile.employee_code || '',
        designation: profile.designation || '',
        department: deptName || 'Unknown',
        totalKpis: empKpis.length,
        completedKpis,
        approvedKpis,
        avgSelfScore: avgSelf,
        avgManagerScore: avgManager,
        // Use null when no data exists for optional stages to distinguish from zero
        avgSkipLevelScore: hasSkipLevelData ? avgSkipLevel : null,
        avgHrPmsScore: hasHrPmsData ? avgHrPms : null,
        avgAuditorScore: avgAuditor,
        avgManagementScore: avgManagement,
        avgFinalScore: avgFinal,
        hasSelfData,
        hasManagerData,
        hasSkipLevelData,
        hasHrPmsData,
        hasAuditorData,
        hasManagementData,
        kpiDetails,
        categoryMetrics,
      };
    }).filter(Boolean) as EmployeeScorecard[];

    return scorecards;
  }, [kpis, profiles, submissions, departments, categories]);

  // Filter by search
  const filteredScorecards = useMemo(() => {
    if (!searchTerm) return employeeScorecards;
    const term = searchTerm.toLowerCase();
    return employeeScorecards.filter(sc => 
      sc.employeeName.toLowerCase().includes(term) ||
      sc.employeeCode.toLowerCase().includes(term) ||
      sc.department.toLowerCase().includes(term)
    );
  }, [employeeScorecards, searchTerm]);

  // Summary stats
  const stats = useMemo(() => {
    const scorecards = filteredScorecards;
    const totalEmployees = scorecards.length;
    const totalKpis = scorecards.reduce((sum, sc) => sum + sc.totalKpis, 0);
    const totalApproved = scorecards.reduce((sum, sc) => sum + sc.approvedKpis, 0);
    const avgFinal = totalEmployees > 0 
      ? scorecards.reduce((sum, sc) => sum + sc.avgFinalScore, 0) / totalEmployees 
      : 0;

    return { totalEmployees, totalKpis, totalApproved, avgFinal };
  }, [filteredScorecards]);

  const handleExportExcel = () => {
    const exportData = filteredScorecards.map(sc => ({
      'Company': getCompanyCode(sc.employeeId),
      'Employee Code': sc.employeeCode,
      'Employee Name': sc.employeeName,
      'Designation': sc.designation,
      'Department': sc.department,
      'Total KPIs': sc.totalKpis,
      'Approved KPIs': sc.approvedKpis,
      'Avg Self Score': sc.avgSelfScore.toFixed(2),
      'Avg Manager Score': sc.avgManagerScore.toFixed(2),
      'Avg Skip-Level Score': sc.avgSkipLevelScore != null ? sc.avgSkipLevelScore.toFixed(2) : '-',
      'Avg HR PMS Score': sc.avgHrPmsScore != null ? sc.avgHrPmsScore.toFixed(2) : '-',
      'Avg Auditor Score': sc.avgAuditorScore.toFixed(2),
      'Avg Management Score': sc.avgManagementScore.toFixed(2),
      'Avg Final Score': sc.avgFinalScore.toFixed(2),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Scorecard');
    XLSX.writeFile(wb, `Monthly_Scorecard_${selectedPeriod}_${selectedYear}.xlsx`);
  };

  const handleExportAllPdf = () => {
    if (filteredScorecards.length === 0) return;
    
    generateBulkScorecardPdf(filteredScorecards, {
      period: selectedPeriod,
      year: selectedYear,
      companyName,
    });
  };

  const handleExportSinglePdf = (scorecard: EmployeeScorecard) => {
    generateDetailedScorecardPdf(scorecard, {
      period: selectedPeriod,
      year: selectedYear,
      companyName,
    });
  };

  const handlePreviewPdf = (scorecard: EmployeeScorecard) => {
    setPreviewScorecard(scorecard);
  };

  const handleClosePreview = () => {
    setPreviewScorecard(null);
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

  /** Helper: display score with proper null vs zero handling */
  const displayScore = (score: number | null | undefined, hasData?: boolean): string => {
    // For optional stages (skip-level, hr-pms), null means "stage doesn't exist"
    if (score == null) return '-';
    // hasData flag distinguishes "no data → show dash" from "data exists, score is 0 → show 0.00"
    if (score === 0 && hasData === false) return '-';
    return score.toFixed(2);
  };

  const singleMonthLoading = isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Scorecard Report"
        description={
          viewMode === 'single'
            ? `Employee performance scorecards for ${selectedPeriod} ${selectedYear}`
            : 'Multi-month score trend per employee'
        }
        backTo="/reports"
        actions={
          canExport && viewMode === 'single' ? (
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
          ) : undefined
        }
      />

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'single' | 'range')}>
        <TabsList>
          <TabsTrigger value="single">Single Month</TabsTrigger>
          <TabsTrigger value="range">Date Range (Trend)</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-6 mt-4">
          {singleMonthLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-24 w-full" />
              <div className="grid gap-4 md:grid-cols-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
              </div>
              <Skeleton className="h-96" />
            </div>
          ) : (
            <>
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
                    <TableHead className="text-center">Skip-Level</TableHead>
                    <TableHead className="text-center">HR PMS</TableHead>
                    <TableHead className="text-center">Auditor</TableHead>
                    <TableHead className="text-center">Mgmt</TableHead>
                    <TableHead className="text-center">Final</TableHead>
                    <TableHead className="text-center w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredScorecards.map((scorecard) => (
                    <TableRow key={scorecard.employeeId}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{scorecard.employeeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {scorecard.employeeCode} • {scorecard.designation}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{scorecard.department}</TableCell>
                      <TableCell className="text-center">
                        <div className="text-sm">
                          {scorecard.approvedKpis}/{scorecard.totalKpis}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {displayScore(scorecard.avgSelfScore, scorecard.hasSelfData)}
                      </TableCell>
                      <TableCell className="text-center">
                        {displayScore(scorecard.avgManagerScore, scorecard.hasManagerData)}
                      </TableCell>
                      <TableCell className="text-center">
                        {displayScore(scorecard.avgSkipLevelScore, scorecard.hasSkipLevelData)}
                      </TableCell>
                      <TableCell className="text-center">
                        {displayScore(scorecard.avgHrPmsScore, scorecard.hasHrPmsData)}
                      </TableCell>
                      <TableCell className="text-center">
                        {displayScore(scorecard.avgAuditorScore, scorecard.hasAuditorData)}
                      </TableCell>
                      <TableCell className="text-center">
                        {displayScore(scorecard.avgManagementScore, scorecard.hasManagementData)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold">
                          {scorecard.avgFinalScore != null ? scorecard.avgFinalScore.toFixed(2) : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handlePreviewPdf(scorecard)}
                            title="Preview PDF"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleExportSinglePdf(scorecard)}
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PDF Preview Dialog */}
      <Dialog open={!!previewScorecard} onOpenChange={handleClosePreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              PDF Preview - {previewScorecard?.employeeName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden" style={{ height: 'calc(90vh - 120px)' }}>
            {pdfBlobUrl && (
              <iframe 
                src={pdfBlobUrl} 
                className="w-full h-full border-0"
                title="PDF Preview"
              />
            )}
          </div>
          <DialogFooter className="p-4 pt-2 border-t">
            <Button variant="outline" onClick={handleClosePreview}>
              Close
            </Button>
            <Button 
              className="gap-2"
              onClick={() => {
                if (previewScorecard) {
                  handleExportSinglePdf(previewScorecard);
                }
              }}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
            </>
          )}
        </TabsContent>

        <TabsContent value="range" className="mt-4">
          <MonthlyTrendView canExport={canExport} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
