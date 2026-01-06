import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKraCategories } from '@/hooks/useOrganization';
import { useOrgKpiValues, useBulkUpsertOrgKpiValues, OrgKpiValue } from '@/hooks/useOrgKpiValues';
import { useOrgLevelKpis } from '@/hooks/useOrgLevelKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { Building2, Save, AlertTriangle, Filter } from 'lucide-react';

interface EditableKpi {
  category_id: string;
  kra_name: string;
  kpi_name: string;
  target_value: number | null;
  uom: string | null;
  achieved_value: number | null;
  data_source: string;
  isModified: boolean;
  // Threshold fields for uniform scoring mode
  r5: string;
  r4: string;
  r3: string;
  r2: string;
  r1: string;
  r0: string;
  criteria: string;
}

export default function OrgKpiDataEntry() {
  const { profile } = useAuth();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [editedValues, setEditedValues] = useState<Map<string, EditableKpi>>(new Map());
  const [globalDataSource, setGlobalDataSource] = useState('');

  // Fetch org-level KPIs (where is_org_level = true at KPI level)
  const { data: orgLevelKpis, isLoading: kpisLoading } = useOrgLevelKpis(selectedPeriod, selectedYear);
  const { data: categories } = useKraCategories();
  const { data: existingOrgValues } = useOrgKpiValues(
    selectedCategoryId !== 'all' ? selectedCategoryId : undefined, 
    selectedPeriod, 
    selectedYear
  );
  const bulkUpsert = useBulkUpsertOrgKpiValues();

  // Get unique categories from org-level KPIs
  const orgLevelCategories = useMemo(() => {
    if (!orgLevelKpis || !categories) return [];
    const categoryIds = new Set(orgLevelKpis.map(k => k.category_id));
    return categories.filter(c => categoryIds.has(c.id));
  }, [orgLevelKpis, categories]);

  // Filter KPIs by selected category
  const filteredKpis = useMemo(() => {
    if (!orgLevelKpis) return [];
    if (selectedCategoryId === 'all') return orgLevelKpis;
    return orgLevelKpis.filter(k => k.category_id === selectedCategoryId);
  }, [orgLevelKpis, selectedCategoryId]);

  // Create a map of existing org values for quick lookup
  const existingValuesMap = useMemo(() => {
    const map = new Map<string, OrgKpiValue>();
    existingOrgValues?.forEach(v => {
      const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}`;
      map.set(key, v);
    });
    return map;
  }, [existingOrgValues]);

  // Check if any category uses uniform scoring
  const getCategoryScoringMode = (categoryId: string) => {
    return categories?.find(c => c.id === categoryId)?.org_scoring_mode || 'individual';
  };

  const getDisplayValue = (categoryId: string, kraName: string, kpiName: string) => {
    const key = `${categoryId}||${kraName}||${kpiName}`;
    const edited = editedValues.get(key);
    const existing = existingValuesMap.get(key);
    
    if (edited) {
      return {
        achieved_value: edited.achieved_value,
        data_source: edited.data_source,
        target_value: edited.target_value,
        r5: edited.r5,
        r4: edited.r4,
        r3: edited.r3,
        r2: edited.r2,
        r1: edited.r1,
        r0: edited.r0,
        criteria: edited.criteria,
      };
    }
    
    return {
      achieved_value: existing?.achieved_value ?? null,
      data_source: existing?.data_source ?? '',
      target_value: existing?.target_value ?? null,
      r5: existing?.r5 ?? '',
      r4: existing?.r4 ?? '',
      r3: existing?.r3 ?? '',
      r2: existing?.r2 ?? '',
      r1: existing?.r1 ?? '',
      r0: existing?.r0 ?? '',
      criteria: existing?.criteria ?? 'Higher is Better',
    };
  };

  const handleValueChange = (categoryId: string, kraName: string, kpiName: string, field: keyof EditableKpi, value: string, kpi: typeof filteredKpis[0]) => {
    const key = `${categoryId}||${kraName}||${kpiName}`;
    const existing = existingValuesMap.get(key);
    
    const current = editedValues.get(key) || {
      category_id: categoryId,
      kra_name: kraName,
      kpi_name: kpiName,
      target_value: existing?.target_value ?? kpi?.target_value ?? null,
      uom: kpi?.uom ?? null,
      achieved_value: existing?.achieved_value ?? null,
      data_source: existing?.data_source ?? '',
      isModified: false,
      r5: existing?.r5 ?? '',
      r4: existing?.r4 ?? '',
      r3: existing?.r3 ?? '',
      r2: existing?.r2 ?? '',
      r1: existing?.r1 ?? '',
      r0: existing?.r0 ?? '',
      criteria: existing?.criteria ?? 'Higher is Better',
    };

    let parsedValue: string | number | null = value;
    if (field === 'achieved_value' || field === 'target_value') {
      parsedValue = value === '' ? null : parseFloat(value);
    }

    const updated = {
      ...current,
      [field]: parsedValue,
      isModified: true,
    };

    setEditedValues(new Map(editedValues.set(key, updated)));
  };

  const handleApplyGlobalDataSource = () => {
    if (!globalDataSource) return;
    
    const newEdited = new Map(editedValues);
    filteredKpis.forEach(kpi => {
      const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
      const existing = existingValuesMap.get(key);
      const current = newEdited.get(key) || {
        category_id: kpi.category_id,
        kra_name: kpi.kra_name,
        kpi_name: kpi.kpi_name,
        target_value: existing?.target_value ?? kpi.target_value,
        uom: kpi.uom,
        achieved_value: existing?.achieved_value ?? null,
        data_source: '',
        isModified: false,
        r5: existing?.r5 ?? '',
        r4: existing?.r4 ?? '',
        r3: existing?.r3 ?? '',
        r2: existing?.r2 ?? '',
        r1: existing?.r1 ?? '',
        r0: existing?.r0 ?? '',
        criteria: existing?.criteria ?? 'Higher is Better',
      };
      newEdited.set(key, { ...current, data_source: globalDataSource, isModified: true });
    });
    setEditedValues(newEdited);
  };

  const handleSaveAll = async () => {
    const valuesToSave = Array.from(editedValues.values())
      .filter(v => v.isModified)
      .map(v => {
        const scoringMode = getCategoryScoringMode(v.category_id);
        const isUniform = scoringMode === 'uniform';
        
        return {
          category_id: v.category_id,
          kra_name: v.kra_name,
          kpi_name: v.kpi_name,
          review_period: selectedPeriod,
          review_year: selectedYear,
          achieved_value: v.achieved_value,
          data_source: v.data_source || undefined,
          entered_by: profile?.id,
          // Include threshold fields for uniform scoring
          ...(isUniform && {
            target_value: v.target_value,
            r5: v.r5 || undefined,
            r4: v.r4 || undefined,
            r3: v.r3 || undefined,
            r2: v.r2 || undefined,
            r1: v.r1 || undefined,
            r0: v.r0 || undefined,
            criteria: v.criteria || 'Higher is Better',
          }),
        };
      });

    if (valuesToSave.length === 0) return;

    await bulkUpsert.mutateAsync(valuesToSave);
    setEditedValues(new Map());
  };

  const modifiedCount = Array.from(editedValues.values()).filter(v => v.isModified).length;

  if (kpisLoading) {
    return <TableSkeleton rows={5} columns={5} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization KPI Data Entry</h1>
        <p className="text-muted-foreground">
          Enter verified organizational data for KPIs marked as organization-level
        </p>
      </div>

      {/* No org-level KPIs warning */}
      {(!orgLevelKpis || orgLevelKpis.length === 0) && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">No Organization-Level KPIs Found</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  To use this feature, mark individual KPIs as "Organization-Level" in the Admin KPI Editor or when assigning KRAs.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <ReviewPeriodSelector
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
              onPeriodChange={setSelectedPeriod}
              onYearChange={setSelectedYear}
            />
            <div className="space-y-2">
              <Label>Filter by Category</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {orgLevelCategories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: cat.color || '#6B7280' }} 
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Entry Table */}
      {orgLevelKpis && orgLevelKpis.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organization-Level KPIs - Data Entry
              </CardTitle>
              <CardDescription>
                {filteredKpis.length} org-level KPIs found for {selectedPeriod} {selectedYear}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {modifiedCount > 0 && (
                <Badge variant="secondary">
                  {modifiedCount} unsaved changes
                </Badge>
              )}
              <Button 
                onClick={handleSaveAll} 
                disabled={modifiedCount === 0 || bulkUpsert.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {bulkUpsert.isPending ? 'Saving...' : 'Save All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Global data source input */}
            <div className="flex items-end gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Apply Data Source to All</Label>
                <Input
                  placeholder="e.g., ERP System, Safety Report Dec 2025"
                  value={globalDataSource}
                  onChange={(e) => setGlobalDataSource(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button size="sm" variant="secondary" onClick={handleApplyGlobalDataSource}>
                Apply to All
              </Button>
            </div>

            {kpisLoading ? (
              <TableSkeleton rows={5} columns={5} />
            ) : filteredKpis.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No org-level KPIs found for the selected filters</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Category</TableHead>
                    <TableHead className="font-semibold">KRA</TableHead>
                    <TableHead className="font-semibold">KPI</TableHead>
                    <TableHead className="font-semibold text-center w-28">Target</TableHead>
                    <TableHead className="font-semibold text-center w-36">Achieved Value</TableHead>
                    <TableHead className="font-semibold w-48">Data Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKpis.map((kpi, idx) => {
                    const display = getDisplayValue(kpi.category_id, kpi.kra_name, kpi.kpi_name);
                    const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
                    const isModified = editedValues.get(key)?.isModified;
                    const isUniformScoring = getCategoryScoringMode(kpi.category_id) === 'uniform';
                    
                    return (
                      <TableRow 
                        key={key} 
                        className={`${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'} ${isModified ? 'ring-1 ring-primary/30' : ''}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ backgroundColor: kpi.kra_categories?.color || '#6B7280' }} 
                            />
                            <span className="text-sm">{kpi.kra_categories?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{kpi.kra_name}</TableCell>
                        <TableCell>{kpi.kpi_name}</TableCell>
                        <TableCell className="text-center">
                          {isUniformScoring ? (
                            <Input
                              type="number"
                              value={display.target_value ?? ''}
                              onChange={(e) => handleValueChange(kpi.category_id, kpi.kra_name, kpi.kpi_name, 'target_value', e.target.value, kpi)}
                              placeholder="Target"
                              className="h-8 text-center"
                            />
                          ) : (
                            <>
                              <span className="font-mono">{kpi.target_value}</span>
                              {kpi.uom && <span className="text-xs text-muted-foreground ml-1">{kpi.uom}</span>}
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={display.achieved_value ?? ''}
                            onChange={(e) => handleValueChange(kpi.category_id, kpi.kra_name, kpi.kpi_name, 'achieved_value', e.target.value, kpi)}
                            placeholder="Enter value"
                            className="h-8 text-center"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={display.data_source || ''}
                            onChange={(e) => handleValueChange(kpi.category_id, kpi.kra_name, kpi.kpi_name, 'data_source', e.target.value, kpi)}
                            placeholder="Source"
                            className="h-8"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
