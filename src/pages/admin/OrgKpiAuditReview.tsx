import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKraCategories } from '@/hooks/useOrganization';
import { useOrgKpiAuditReview, useSubmitOrgKpiAuditScore, OrgKpiAuditEmployee } from '@/hooks/useOrgKpiAuditReview';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { OrgKpiAuditCard } from '@/components/admin/OrgKpiAuditCard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { Shield, Search, CheckCheck, Clock, FileBarChart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function OrgKpiAuditReview() {
  const { toast } = useToast();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'audited'>('all');

  const { data: auditData, isLoading } = useOrgKpiAuditReview(selectedPeriod, selectedYear);
  const { data: categories } = useKraCategories();
  const submitScore = useSubmitOrgKpiAuditScore();

  const groups = auditData?.groups || [];
  const totalPending = auditData?.totalPending || 0;
  const totalAudited = auditData?.totalAudited || 0;
  const totalAll = totalPending + totalAudited;
  const progressPercent = totalAll > 0 ? (totalAudited / totalAll) * 100 : 0;

  // Get categories that have audit-stage org KPIs
  const activeCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach(g => ids.add(g.categoryId));
    return ids;
  }, [groups]);

  const availableCategories = useMemo(() => {
    return categories?.filter(c => activeCategoryIds.has(c.id)) || [];
  }, [categories, activeCategoryIds]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    return groups.filter(g => {
      if (selectedCategoryId !== 'all' && g.categoryId !== selectedCategoryId) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!g.kraName.toLowerCase().includes(q) && !g.kpiName.toLowerCase().includes(q) && !g.categoryName.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (statusFilter === 'pending' && g.pendingCount === 0) return false;
      if (statusFilter === 'audited' && g.pendingCount > 0) return false;
      return true;
    });
  }, [groups, selectedCategoryId, searchQuery, statusFilter]);


  const handleSubmitScore = useCallback(async (kpiId: string, score: number, remarks: string, approve: boolean, workflowStages: string[]) => {
    await submitScore.mutateAsync({ kpiId, auditorScore: score, auditorRemarks: remarks, approve, workflowStages });
    toast({
      title: approve ? 'Audit score approved & forwarded' : 'Audit score saved',
    });
  }, [submitScore, toast]);

  const handleBulkApprove = useCallback(async (employees: OrgKpiAuditEmployee[], score: number, remarks: string) => {
    let successCount = 0;
    let failCount = 0;
    for (const emp of employees) {
      try {
        await submitScore.mutateAsync({
          kpiId: emp.kpiId,
          auditorScore: score,
          auditorRemarks: remarks,
          approve: true,
          workflowStages: emp.workflowStages,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }
    toast({
      title: `Bulk approve complete`,
      description: `${successCount} approved${failCount > 0 ? `, ${failCount} failed` : ''}`,
      variant: failCount > 0 ? 'destructive' : 'default',
    });
  }, [submitScore, toast]);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Org KPI Audit Review</h1>
        </div>
        <p className="text-muted-foreground text-sm">Review and approve organization-level KPIs at the audit stage</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <ReviewPeriodSelector
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
              onPeriodChange={setSelectedPeriod}
              onYearChange={setSelectedYear}
            />
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search KRA, KPI, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={selectedCategoryId === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategoryId('all')}
            >
              All ({groups.length})
            </Badge>
            {availableCategories.map(cat => {
              const count = groups.filter(g => g.categoryId === cat.id).length;
              return (
                <Badge
                  key={cat.id}
                  variant={selectedCategoryId === cat.id ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  {cat.name} ({count})
                </Badge>
              );
            })}
          </div>

          {/* Status filter */}
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all" className="text-xs">
                <FileBarChart className="h-3.5 w-3.5 mr-1" />
                All ({totalAll})
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs">
                <Clock className="h-3.5 w-3.5 mr-1" />
                Pending ({totalPending})
              </TabsTrigger>
              <TabsTrigger value="audited" className="text-xs">
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Audited ({totalAudited})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Progress */}
      {totalAll > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Audit Progress</span>
              <span className="text-sm text-muted-foreground">
                {totalPending} pending · {totalAudited} audited
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {isLoading ? (
        <TableSkeleton />
      ) : filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No org-level KPIs at audit stage</p>
            <p className="text-sm mt-1">
              {searchQuery || selectedCategoryId !== 'all'
                ? 'Try adjusting your filters'
                : 'No organization KPIs have reached the audit stage for this period'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map(group => (
            <OrgKpiAuditCard
              key={`${group.categoryId}||${group.kraName}||${group.kpiName}`}
              group={group}
              onSubmitScore={handleSubmitScore}
              onBulkApprove={handleBulkApprove}
              isSubmitting={submitScore.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
