import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { useOrgLevelKpis } from '@/hooks/useOrgLevelKpis';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { Loader2, Building2, Database, TrendingUp, AlertCircle, Users, History, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { OrgKpiImpactSheet } from '@/components/admin/OrgKpiImpactSheet';
import { OrgKpiMappingDashboard } from '@/components/admin/OrgKpiMappingDashboard';
import { OrgKpiHistoryTimeline } from '@/components/admin/OrgKpiHistoryTimeline';

export default function OrgKpiOverview() {
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [reviewPeriod, setReviewPeriod] = useState<string>(defaultPeriod);
  const [reviewYear, setReviewYear] = useState<number>(defaultYear);
  const [activeTab, setActiveTab] = useState('overview');

  // Impact sheet state
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactTarget, setImpactTarget] = useState<{ categoryId: string; kraName: string; kpiName: string; achievedValue: number | null } | null>(null);

  const { data: orgKpis, isLoading: loadingKpis } = useOrgLevelKpis(reviewPeriod, reviewYear);
  const { data: orgValues, isLoading: loadingValues } = useOrgKpiValues(undefined, reviewPeriod, reviewYear);

  const isLoading = loadingKpis || loadingValues;

  // Create a map of org values for quick lookup
  const valueMap = new Map<string, typeof orgValues extends (infer T)[] ? T : never>();
  orgValues?.forEach(v => {
    const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}`;
    valueMap.set(key, v);
  });

  // Group KPIs by category
  const groupedKpis = orgKpis?.reduce((acc, kpi) => {
    const catName = kpi.kra_categories?.name || 'Uncategorized';
    if (!acc[catName]) {
      acc[catName] = {
        color: kpi.kra_categories?.color || '#6B7280',
        weightage: kpi.kra_categories?.weightage || 0,
        kpis: []
      };
    }
    acc[catName].kpis.push(kpi);
    return acc;
  }, {} as Record<string, { color: string; weightage: number; kpis: typeof orgKpis }>);

  // Calculate stats
  const totalKpis = orgKpis?.length || 0;
  const kpisWithValues = orgKpis?.filter(kpi => {
    const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
    const value = valueMap.get(key);
    return value?.achieved_value !== null && value?.achieved_value !== undefined;
  }).length || 0;
  const categories = Object.keys(groupedKpis || {}).length;

  const openImpact = (categoryId: string, kraName: string, kpiName: string, achievedValue: number | null) => {
    setImpactTarget({ categoryId, kraName, kpiName, achievedValue });
    setImpactOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization-Level KPI Overview"
        description="View all organization-level KPIs and their centrally managed values"
      />

      <div className="flex flex-wrap gap-4 items-center">
        <ReviewPeriodSelector
          selectedPeriod={reviewPeriod}
          selectedYear={reviewYear}
          onPeriodChange={setReviewPeriod}
          onYearChange={setReviewYear}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Org-Level KPIs</p>
                <p className="text-2xl font-bold">{totalKpis}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-accent rounded-lg">
                <TrendingUp className="h-6 w-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Values Entered</p>
                <p className="text-2xl font-bold">{kpisWithValues} / {totalKpis}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary rounded-lg">
                <Database className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">{categories}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Overview / Mapping / History */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="mapping" className="gap-1">
            <Users className="h-4 w-4" />
            Mapping
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="h-4 w-4" />
            Change History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !reviewPeriod ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Please select a review period to view organization-level KPIs.</p>
              </CardContent>
            </Card>
          ) : totalKpis === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No organization-level KPIs found for this period.</p>
                <p className="text-sm mt-2">Mark KPIs as "Organization-Level" in Admin → All KRAs to see them here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedKpis || {}).map(([catName, { color, weightage, kpis }]) => (
                <Card key={catName}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: color }}
                      />
                      <CardTitle className="text-lg">{catName}</CardTitle>
                      <Badge variant="secondary">{weightage}% weight</Badge>
                      <Badge variant="outline">{kpis.length} KPIs</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">KRA</TableHead>
                          <TableHead className="w-[250px]">KPI</TableHead>
                          <TableHead className="w-[100px]">Target</TableHead>
                          <TableHead className="w-[100px]">Achieved</TableHead>
                          <TableHead className="w-[80px]">Weight</TableHead>
                          <TableHead>Data Source</TableHead>
                          <TableHead>Remarks</TableHead>
                          <TableHead className="w-[80px] text-center">Impact</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {kpis.map(kpi => {
                          const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
                          const value = valueMap.get(key);
                          const hasValue = value?.achieved_value !== null && value?.achieved_value !== undefined;

                          return (
                            <TableRow key={kpi.id}>
                              <TableCell className="font-medium whitespace-pre-wrap">{renderBoldKpiText(kpi.kra_name)}</TableCell>
                              <TableCell className="whitespace-pre-wrap">{renderBoldKpiText(kpi.kpi_name)}</TableCell>
                              <TableCell>
                                {kpi.target_value !== null ? (
                                  <span className="font-mono">{kpi.target_value}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {hasValue ? (
                                  <span className={cn(
                                    "font-mono font-medium",
                                    value.achieved_value !== null && kpi.target_value !== null && 
                                    value.achieved_value >= kpi.target_value 
                                      ? "text-primary" 
                                      : "text-foreground"
                                  )}>
                                    {value.achieved_value}
                                  </span>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground border-muted">
                                    Pending
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="text-muted-foreground">{kpi.weightage || 0}%</span>
                              </TableCell>
                              <TableCell>
                                {value?.data_source ? (
                                  <span className="text-sm">{value.data_source}</span>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {value?.remarks ? (
                                  <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
                                    {value.remarks}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openImpact(kpi.category_id, kpi.kra_name, kpi.kpi_name, value?.achieved_value ?? null)}
                                  title="View Impact Analysis"
                                >
                                  <Users className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mapping">
          {reviewPeriod && reviewYear ? (
            <OrgKpiMappingDashboard reviewPeriod={reviewPeriod} reviewYear={reviewYear} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a review period to view mapping data.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Value Change History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrgKpiHistoryTimeline reviewPeriod={reviewPeriod} reviewYear={reviewYear} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Impact Analysis Sheet */}
      {impactTarget && (
        <OrgKpiImpactSheet
          open={impactOpen}
          onOpenChange={setImpactOpen}
          categoryId={impactTarget.categoryId}
          kraName={impactTarget.kraName}
          kpiName={impactTarget.kpiName}
          reviewPeriod={reviewPeriod}
          reviewYear={reviewYear}
          currentAchievedValue={impactTarget.achievedValue}
        />
      )}
    </div>
  );
}
