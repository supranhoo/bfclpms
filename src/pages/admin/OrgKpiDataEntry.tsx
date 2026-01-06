import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKraCategories } from '@/hooks/useOrganization';
import { useOrgKpiValues, useBulkUpsertOrgKpiValues, useOrgLevelCategories } from '@/hooks/useOrgKpiValues';
import { useKpisByPeriod } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { Building2, Save, AlertTriangle } from 'lucide-react';

interface EditableKpi {
  category_id: string;
  kra_name: string;
  kpi_name: string;
  target_value: number | null;
  uom: string | null;
  achieved_value: number | null;
  data_source: string;
  isModified: boolean;
}

export default function OrgKpiDataEntry() {
  const { profile } = useAuth();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [editedValues, setEditedValues] = useState<Map<string, EditableKpi>>(new Map());
  const [globalDataSource, setGlobalDataSource] = useState('');

  const { data: orgLevelCategories, isLoading: categoriesLoading } = useOrgLevelCategories();
  const { data: kpis, isLoading: kpisLoading } = useKpisByPeriod(selectedPeriod, selectedYear);
  const { data: existingOrgValues } = useOrgKpiValues(selectedCategoryId, selectedPeriod, selectedYear);
  const bulkUpsert = useBulkUpsertOrgKpiValues();

  // Get unique KPI definitions for the selected org-level category
  const uniqueKpis = useMemo(() => {
    if (!kpis || !selectedCategoryId) return [];

    const categoryKpis = kpis.filter(k => k.category_id === selectedCategoryId);
    const uniqueMap = new Map<string, { kra_name: string; kpi_name: string; target_value: number | null; uom: string | null }>();

    categoryKpis.forEach(kpi => {
      const key = `${kpi.kra_name}||${kpi.kpi_name}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
          target_value: kpi.target_value,
          uom: kpi.uom,
        });
      }
    });

    return Array.from(uniqueMap.values());
  }, [kpis, selectedCategoryId]);

  // Create a map of existing org values for quick lookup
  const existingValuesMap = useMemo(() => {
    const map = new Map<string, { achieved_value: number | null; data_source: string | null }>();
    existingOrgValues?.forEach(v => {
      const key = `${v.kra_name}||${v.kpi_name}`;
      map.set(key, { achieved_value: v.achieved_value, data_source: v.data_source });
    });
    return map;
  }, [existingOrgValues]);

  const getDisplayValue = (kraName: string, kpiName: string) => {
    const key = `${kraName}||${kpiName}`;
    const edited = editedValues.get(key);
    if (edited) {
      return { achieved_value: edited.achieved_value, data_source: edited.data_source };
    }
    const existing = existingValuesMap.get(key);
    return { achieved_value: existing?.achieved_value ?? null, data_source: existing?.data_source ?? '' };
  };

  const handleValueChange = (kraName: string, kpiName: string, field: 'achieved_value' | 'data_source', value: string) => {
    const key = `${kraName}||${kpiName}`;
    const current = editedValues.get(key) || {
      category_id: selectedCategoryId,
      kra_name: kraName,
      kpi_name: kpiName,
      target_value: uniqueKpis.find(k => k.kra_name === kraName && k.kpi_name === kpiName)?.target_value ?? null,
      uom: uniqueKpis.find(k => k.kra_name === kraName && k.kpi_name === kpiName)?.uom ?? null,
      achieved_value: existingValuesMap.get(key)?.achieved_value ?? null,
      data_source: existingValuesMap.get(key)?.data_source ?? '',
      isModified: false,
    };

    const updated = {
      ...current,
      [field]: field === 'achieved_value' ? (value === '' ? null : parseFloat(value)) : value,
      isModified: true,
    };

    setEditedValues(new Map(editedValues.set(key, updated)));
  };

  const handleApplyGlobalDataSource = () => {
    if (!globalDataSource) return;
    
    const newEdited = new Map(editedValues);
    uniqueKpis.forEach(kpi => {
      const key = `${kpi.kra_name}||${kpi.kpi_name}`;
      const current = newEdited.get(key) || {
        category_id: selectedCategoryId,
        kra_name: kpi.kra_name,
        kpi_name: kpi.kpi_name,
        target_value: kpi.target_value,
        uom: kpi.uom,
        achieved_value: existingValuesMap.get(key)?.achieved_value ?? null,
        data_source: '',
        isModified: false,
      };
      newEdited.set(key, { ...current, data_source: globalDataSource, isModified: true });
    });
    setEditedValues(newEdited);
  };

  const handleSaveAll = async () => {
    const valuesToSave = Array.from(editedValues.values())
      .filter(v => v.isModified)
      .map(v => ({
        category_id: v.category_id,
        kra_name: v.kra_name,
        kpi_name: v.kpi_name,
        review_period: selectedPeriod,
        review_year: selectedYear,
        achieved_value: v.achieved_value,
        data_source: v.data_source || undefined,
        entered_by: profile?.id,
      }));

    if (valuesToSave.length === 0) return;

    await bulkUpsert.mutateAsync(valuesToSave);
    setEditedValues(new Map());
  };

  const modifiedCount = Array.from(editedValues.values()).filter(v => v.isModified).length;
  const selectedCategory = orgLevelCategories?.find(c => c.id === selectedCategoryId);

  if (categoriesLoading) {
    return <TableSkeleton rows={5} columns={5} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization KPI Data Entry</h1>
        <p className="text-muted-foreground">
          Enter verified organizational data for org-level KPI categories
        </p>
      </div>

      {/* No org-level categories warning */}
      {(!orgLevelCategories || orgLevelCategories.length === 0) && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">No Organization-Level Categories</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  To use this feature, mark categories as "Organization-Level" in the KRA Categories settings.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Filters</CardTitle>
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
              <Label>Organization-Level Category</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
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
      {selectedCategoryId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {selectedCategory?.name} - Data Entry
              </CardTitle>
              <CardDescription>
                {uniqueKpis.length} unique KPIs found for {selectedPeriod} {selectedYear}
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
            ) : uniqueKpis.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No KPIs found for this category in the selected period</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">KRA</TableHead>
                    <TableHead className="font-semibold">KPI</TableHead>
                    <TableHead className="font-semibold text-center w-28">Target</TableHead>
                    <TableHead className="font-semibold text-center w-36">Achieved Value</TableHead>
                    <TableHead className="font-semibold w-48">Data Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uniqueKpis.map((kpi, idx) => {
                    const display = getDisplayValue(kpi.kra_name, kpi.kpi_name);
                    const key = `${kpi.kra_name}||${kpi.kpi_name}`;
                    const isModified = editedValues.get(key)?.isModified;
                    
                    return (
                      <TableRow 
                        key={key} 
                        className={`${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'} ${isModified ? 'ring-1 ring-primary/30' : ''}`}
                      >
                        <TableCell className="font-medium">{kpi.kra_name}</TableCell>
                        <TableCell>{kpi.kpi_name}</TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono">{kpi.target_value}</span>
                          {kpi.uom && <span className="text-xs text-muted-foreground ml-1">{kpi.uom}</span>}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={display.achieved_value ?? ''}
                            onChange={(e) => handleValueChange(kpi.kra_name, kpi.kpi_name, 'achieved_value', e.target.value)}
                            placeholder="Enter value"
                            className="h-8 text-center"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={display.data_source || ''}
                            onChange={(e) => handleValueChange(kpi.kra_name, kpi.kpi_name, 'data_source', e.target.value)}
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
