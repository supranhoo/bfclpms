import { useState } from 'react';
import { useAllKpis } from '@/hooks/useKpis';
import { useKraCategories, useProfiles } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatsRowSkeleton, TableSkeleton, FilterBarSkeleton } from '@/components/ui/LoadingSkeletons';
import { Search, Users, Target, Filter } from 'lucide-react';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  audit: 'Audit',
  approved: 'Approved',
};

export default function AllKpis() {
  const { data: kpis, isLoading } = useAllKpis();
  const { data: categories } = useKraCategories();
  const { data: profiles } = useProfiles();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');

  const filteredKpis = kpis?.filter(kpi => {
    const employee = kpi.profiles as { full_name: string; email: string; employee_code: string } | null;
    const matchesSearch = 
      kpi.kra_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kpi.kpi_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee?.employee_code?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || kpi.category_id === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || kpi.status === selectedStatus;
    const matchesEmployee = selectedEmployee === 'all' || kpi.employee_id === selectedEmployee;

    return matchesSearch && matchesCategory && matchesStatus && matchesEmployee;
  });

  // Stats
  const totalKpis = kpis?.length || 0;
  const uniqueEmployees = new Set(kpis?.map(k => k.employee_id)).size;
  const pendingReview = kpis?.filter(k => k.status === 'kra_set' || k.status === 'self_review').length || 0;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        </div>
        <StatsRowSkeleton count={3} />
        <FilterBarSkeleton />
        <TableSkeleton rows={8} columns={7} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">All Employee KRAs</h1>
        <p className="text-muted-foreground">View and manage KRAs across all employees</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total KPIs</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalKpis}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Employees with KRAs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingReview}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search KRA, KPI, or employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {profiles?.map(profile => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs Table */}
      <Card>
        <CardHeader>
          <CardTitle>KPI Details</CardTitle>
          <CardDescription>
            {filteredKpis?.length || 0} KPIs found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>KRA</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Weightage</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKpis?.map(kpi => {
                  const employee = kpi.profiles as { full_name: string; email: string; employee_code: string } | null;
                  const category = kpi.kra_categories as { name: string; color: string } | null;
                  return (
                    <TableRow key={kpi.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{employee?.full_name || 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">{employee?.employee_code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: category?.color || '#3B82F6' }}
                          />
                          <span className="text-sm">{category?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {kpi.kra_name}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {kpi.kpi_name}
                      </TableCell>
                      <TableCell>
                        {kpi.target_value} {kpi.uom}
                      </TableCell>
                      <TableCell>{kpi.weightage}%</TableCell>
                      <TableCell>
                        <Badge className={statusColors[kpi.status || 'kra_set']}>
                          {statusLabels[kpi.status || 'kra_set']}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!filteredKpis || filteredKpis.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No KPIs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
