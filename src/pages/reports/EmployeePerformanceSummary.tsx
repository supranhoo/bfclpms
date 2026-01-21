import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Search, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  management_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  audit: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  self_review: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  kra_set: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  management_review: 'Management Review',
  audit: 'Audit',
  manager_check: 'Manager Check',
  self_review: 'Self Review',
  kra_set: 'KRA Set',
};

export default function EmployeePerformanceSummary() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch review periods for the selected year
  const { data: reviewPeriods } = useQuery({
    queryKey: ['review-periods', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_periods')
        .select('*')
        .eq('review_year', parseInt(selectedYear))
        .order('period_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch all KPIs with employee details and submissions
  const { data: performanceData, isLoading } = useQuery({
    queryKey: ['employee-performance-summary', selectedYear, selectedPeriod],
    queryFn: async () => {
      // Base query for KPIs
      let kpisQuery = supabase
        .from('kpis')
        .select(`
          id,
          employee_id,
          kra_name,
          kpi_name,
          weightage,
          status,
          review_period,
          review_year,
          review_submissions (
            final_score,
            self_score,
            manager_score,
            auditor_score,
            management_score
          )
        `)
        .eq('review_year', parseInt(selectedYear));

      if (selectedPeriod !== 'all') {
        kpisQuery = kpisQuery.eq('review_period', selectedPeriod);
      }

      const { data: kpis, error: kpisError } = await kpisQuery;
      if (kpisError) throw kpisError;

      // Fetch all profiles with department info
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          employee_code,
          full_name,
          designation,
          reporting_manager_id,
          departments (name)
        `);
      if (profilesError) throw profilesError;

      // Create profile lookup map
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Group KPIs by employee and period
      const employeePeriodMap = new Map<string, {
        employeeId: string;
        employeeCode: string;
        fullName: string;
        department: string;
        designation: string;
        reportingManager: string;
        reviewPeriod: string;
        status: string;
        totalScore: number;
        outOfScore: number;
        kpiCount: number;
      }>();

      kpis?.forEach(kpi => {
        const profile = profileMap.get(kpi.employee_id);
        if (!profile) return;

        const manager = profile.reporting_manager_id 
          ? profileMap.get(profile.reporting_manager_id) 
          : null;

        const key = `${kpi.employee_id}-${kpi.review_period}`;
        const existing = employeePeriodMap.get(key);

        const submission = kpi.review_submissions;
        const finalScore = submission?.final_score || 
                          submission?.management_score || 
                          submission?.auditor_score || 
                          submission?.manager_score || 
                          submission?.self_score || 0;
        const weightage = kpi.weightage || 100;

        if (existing) {
          existing.totalScore += finalScore;
          existing.outOfScore += weightage;
          existing.kpiCount += 1;
          // Use the most advanced status
          if (getStatusPriority(kpi.status || 'kra_set') > getStatusPriority(existing.status)) {
            existing.status = kpi.status || 'kra_set';
          }
        } else {
          employeePeriodMap.set(key, {
            employeeId: kpi.employee_id,
            employeeCode: profile.employee_code || '-',
            fullName: profile.full_name || 'Unknown',
            department: (profile.departments as any)?.name || '-',
            designation: profile.designation || '-',
            reportingManager: manager?.full_name || '-',
            reviewPeriod: kpi.review_period || '-',
            status: kpi.status || 'kra_set',
            totalScore: finalScore,
            outOfScore: weightage,
            kpiCount: 1,
          });
        }
      });

      return Array.from(employeePeriodMap.values());
    },
  });

  // Helper to prioritize status
  function getStatusPriority(status: string): number {
    const priorities: Record<string, number> = {
      'approved': 6,
      'management_review': 5,
      'audit': 4,
      'manager_check': 3,
      'self_review': 2,
      'kra_set': 1,
    };
    return priorities[status] || 0;
  }

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!performanceData) return [];
    
    const term = searchTerm.toLowerCase();
    return performanceData.filter(row =>
      row.fullName.toLowerCase().includes(term) ||
      row.employeeCode.toLowerCase().includes(term) ||
      row.department.toLowerCase().includes(term) ||
      row.designation.toLowerCase().includes(term) ||
      row.reportingManager.toLowerCase().includes(term)
    );
  }, [performanceData, searchTerm]);

  // Calculate overall rating (0-5 scale based on percentage)
  function calculateRating(totalScore: number, outOfScore: number): number {
    if (outOfScore === 0) return 0;
    const percentage = (totalScore / outOfScore) * 100;
    return Math.round((percentage / 20) * 100) / 100; // Scale to 0-5
  }

  // Format period to Month-YY format
  function formatPeriod(period: string, year: number): string {
    const monthIndex = MONTHS.findIndex(m => 
      period.toLowerCase().startsWith(m.toLowerCase())
    );
    if (monthIndex >= 0) {
      return `${MONTHS[monthIndex]}-${String(year).slice(-2)}`;
    }
    return period;
  }

  // Export to Excel
  const handleExport = () => {
    if (!filteredData.length) return;

    const exportData = filteredData.map(row => {
      const percentage = row.outOfScore > 0 
        ? ((row.totalScore / row.outOfScore) * 100).toFixed(2) + '%'
        : '0.00%';
      const rating = calculateRating(row.totalScore, row.outOfScore);

      return {
        'Month': formatPeriod(row.reviewPeriod, parseInt(selectedYear)),
        'Employee ID': row.employeeCode,
        'Full Name': row.fullName,
        'Department': row.department,
        'Designation': row.designation,
        'Reporting Manager': row.reportingManager,
        'Review Status': STATUS_LABELS[row.status] || row.status,
        'Total Score': row.totalScore,
        'Out of Score': row.outOfScore,
        'Overall Rating': rating,
        'Percentage': percentage,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Performance Summary');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 10 }, // Month
      { wch: 12 }, // Employee ID
      { wch: 30 }, // Full Name
      { wch: 35 }, // Department
      { wch: 30 }, // Designation
      { wch: 30 }, // Reporting Manager
      { wch: 18 }, // Review Status
      { wch: 12 }, // Total Score
      { wch: 12 }, // Out of Score
      { wch: 14 }, // Overall Rating
      { wch: 12 }, // Percentage
    ];

    XLSX.writeFile(wb, `Employee_Performance_Summary_${selectedYear}.xlsx`);
  };

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!filteredData.length) return { total: 0, approved: 0, avgScore: 0 };
    
    const approved = filteredData.filter(r => r.status === 'approved').length;
    const totalPercentage = filteredData.reduce((sum, r) => {
      return sum + (r.outOfScore > 0 ? (r.totalScore / r.outOfScore) * 100 : 0);
    }, 0);

    return {
      total: filteredData.length,
      approved,
      avgScore: filteredData.length > 0 ? (totalPercentage / filteredData.length).toFixed(1) : 0,
    };
  }, [filteredData]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Performance Summary"
        description="Comprehensive view of employee scores, ratings, and review status"
        backTo="/reports"
        actions={
          <Button onClick={handleExport} disabled={!filteredData.length}>
            <Download className="mr-2 h-4 w-4" />
            Download Excel
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, ID, department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {reviewPeriods?.map(period => (
                  <SelectItem key={period.id} value={period.period_name}>
                    {period.period_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Reviews</CardTitle>
            <Badge variant="outline" className="bg-green-100 text-green-800">
              {summaryStats.approved}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryStats.total > 0 
                ? ((summaryStats.approved / summaryStats.total) * 100).toFixed(1) 
                : 0}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.avgScore}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Reporting Manager</TableHead>
                    <TableHead>Review Status</TableHead>
                    <TableHead className="text-right">Total Score</TableHead>
                    <TableHead className="text-right">Out of Score</TableHead>
                    <TableHead className="text-right">Overall Rating</TableHead>
                    <TableHead className="text-right">Percentage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        No data found for the selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((row, index) => {
                      const percentage = row.outOfScore > 0 
                        ? ((row.totalScore / row.outOfScore) * 100)
                        : 0;
                      const rating = calculateRating(row.totalScore, row.outOfScore);

                      return (
                        <TableRow key={`${row.employeeId}-${row.reviewPeriod}-${index}`}>
                          <TableCell className="font-medium">
                            {formatPeriod(row.reviewPeriod, parseInt(selectedYear))}
                          </TableCell>
                          <TableCell>{row.employeeCode}</TableCell>
                          <TableCell>{row.fullName}</TableCell>
                          <TableCell>{row.department}</TableCell>
                          <TableCell>{row.designation}</TableCell>
                          <TableCell>{row.reportingManager}</TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={STATUS_COLORS[row.status] || 'bg-gray-100'}
                            >
                              {STATUS_LABELS[row.status] || row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {row.totalScore.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.outOfScore.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {rating.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={
                              percentage >= 80 ? 'text-green-600 dark:text-green-400' :
                              percentage >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400'
                            }>
                              {percentage.toFixed(2)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
