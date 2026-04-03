import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useBeforeUnload } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useDepartments, useDesignations } from '@/hooks/useOrganization';
import { useKpiTemplates, KpiTemplate } from '@/hooks/useKpiTemplates';
import { useTemplateBundle, useCreateTemplateBundle, useUpdateTemplateBundle } from '@/hooks/useTemplateBundles';
import { useToast } from '@/hooks/use-toast';
import { TemplateFormDialog } from '@/components/admin/TemplateFormDialog';
import {
  ArrowLeft, Save, Loader2, Search, X, ChevronUp, ChevronDown,
  Trash2, GripVertical, ChevronRight, Package, Filter, CheckSquare,
  Square, Eye, AlertTriangle, Pencil
} from 'lucide-react';

export default function BundleEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditMode = !!id;

  const { data: bundle, isLoading: bundleLoading } = useTemplateBundle(id);
  const { data: departments } = useDepartments();
  const { data: designations } = useDesignations();
  const { data: templates } = useKpiTemplates();
  const createBundle = useCreateTemplateBundle();
  const updateBundle = useUpdateTemplateBundle();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    department_id: '',
    designation: '',
    is_active: true,
  });
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<KpiTemplate | null>(null);

  // Load bundle data in edit mode
  useEffect(() => {
    if (bundle) {
      setFormData({
        name: bundle.name,
        description: bundle.description || '',
        department_id: bundle.department_id || '',
        designation: bundle.designation || '',
        is_active: bundle.is_active,
      });
      const sortedIds = bundle.template_bundle_items
        ?.sort((a, b) => a.sort_order - b.sort_order)
        .map(item => item.template_id) || [];
      setSelectedTemplateIds(sortedIds);
      setIsDirty(false);
    }
  }, [bundle]);

  // Unsaved changes guard
  useBeforeUnload(
    useCallback((e) => {
      if (isDirty) e.preventDefault();
    }, [isDirty])
  );

  const activeTemplates = useMemo(() =>
    templates?.filter(t => t.is_active) || [],
    [templates]
  );

  const categories = useMemo(() => {
    const cats = new Map<string, { id: string; name: string; color: string | null }>();
    activeTemplates.forEach(t => {
      if (t.kra_categories) {
        cats.set(t.kra_categories.id, t.kra_categories);
      }
    });
    return Array.from(cats.values());
  }, [activeTemplates]);

  const filteredBrowserTemplates = useMemo(() => {
    let list = activeTemplates;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.kra_name.toLowerCase().includes(q) ||
        t.kpi_name.toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== 'all') {
      list = list.filter(t => t.kra_categories?.id === categoryFilter);
    }
    return list;
  }, [activeTemplates, searchQuery, categoryFilter]);

  const selectedTemplates = useMemo(() =>
    selectedTemplateIds
      .map(id => activeTemplates.find(t => t.id === id))
      .filter(Boolean) as KpiTemplate[],
    [selectedTemplateIds, activeTemplates]
  );

  const totalWeightage = useMemo(() =>
    selectedTemplates.reduce((sum, t) => sum + (t.weightage || 0), 0),
    [selectedTemplates]
  );

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplateIds(prev => {
      const next = prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId];
      setIsDirty(true);
      return next;
    });
  };

  const removeTemplate = (templateId: string) => {
    setSelectedTemplateIds(prev => prev.filter(id => id !== templateId));
    setIsDirty(true);
  };

  const moveTemplate = (index: number, direction: 'up' | 'down') => {
    setSelectedTemplateIds(prev => {
      const next = [...prev];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      setIsDirty(true);
      return next;
    });
  };

  const selectAll = () => {
    const allIds = filteredBrowserTemplates.map(t => t.id);
    setSelectedTemplateIds(prev => {
      const combined = new Set([...prev, ...allIds]);
      setIsDirty(true);
      return Array.from(combined);
    });
  };

  const deselectAll = () => {
    const filterIds = new Set(filteredBrowserTemplates.map(t => t.id));
    setSelectedTemplateIds(prev => {
      setIsDirty(true);
      return prev.filter(id => !filterIds.has(id));
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Bundle name is required', variant: 'destructive' });
      return;
    }
    if (selectedTemplateIds.length === 0) {
      toast({ title: 'Select at least one template', variant: 'destructive' });
      return;
    }

    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        department_id: formData.department_id || null,
        designation: formData.designation || null,
        is_active: formData.is_active,
        template_ids: selectedTemplateIds,
      };

      if (isEditMode && id) {
        await updateBundle.mutateAsync({ id, ...payload });
      } else {
        await createBundle.mutateAsync(payload);
      }
      setIsDirty(false);
      navigate('/admin/bundles');
    } catch {
      // Error handled by mutation hooks
    }
  };

  const handleBack = () => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      navigate('/admin/bundles');
    }
  };

  const isSubmitting = createBundle.isPending || updateBundle.isPending;

  if (isEditMode && bundleLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3 space-y-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-96" />
          </div>
          <div className="col-span-2">
            <Skeleton className="h-[600px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">
                {isEditMode ? 'Edit Bundle' : 'Create Bundle'}
              </h1>
              {formData.is_active ? (
                <Badge variant="default" className="text-xs">Active</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Inactive</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isEditMode ? `Editing "${bundle?.name || ''}"` : 'Configure a new KRA bundle'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleBack}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSubmitting || !formData.name.trim() || selectedTemplateIds.length === 0}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isEditMode ? 'Update Bundle' : 'Create Bundle'}
          </Button>
        </div>
      </div>

      {/* Main Content - Two Panel Layout */}
      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 h-full">
          {/* Left Panel - Form & Selected Templates (60%) */}
          <div className="lg:col-span-3 overflow-y-auto border-r p-6 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Bundle Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Bundle Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g., CPP Mech - Standard KRAs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Optional description..."
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Linked Department</Label>
                    <Select
                      value={formData.department_id || 'none'}
                      onValueChange={(v) => updateField('department_id', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {departments?.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Linked Designation</Label>
                    <Select
                      value={formData.designation || 'none'}
                      onValueChange={(v) => updateField('designation', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {designations?.map(d => (
                          <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Active Bundle</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(v) => updateField('is_active', v)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Selected Templates */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Selected Templates ({selectedTemplates.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <WeightageBadge total={totalWeightage} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedTemplates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">No templates selected</p>
                    <p className="text-xs mt-1">Browse and select templates from the right panel</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedTemplates.map((template, index) => (
                      <SelectedTemplateRow
                        key={template.id}
                        template={template}
                        index={index}
                        total={selectedTemplates.length}
                        onMoveUp={() => moveTemplate(index, 'up')}
                        onMoveDown={() => moveTemplate(index, 'down')}
                        onRemove={() => removeTemplate(template.id)}
                        onEdit={() => setEditingTemplate(template)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Template Browser (40%) */}
          <div className="lg:col-span-2 overflow-y-auto p-6 bg-muted/30 space-y-4">
            <div className="space-y-3">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Template Browser
              </h2>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, KRA or KPI name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8"
                />
                {searchQuery && (
                  <Button
                    variant="ghost" size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Category Filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAll} className="text-xs h-7">
                  <CheckSquare className="h-3 w-3 mr-1" />
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll} className="text-xs h-7">
                  <Square className="h-3 w-3 mr-1" />
                  Deselect All
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">
                  {filteredBrowserTemplates.length} template{filteredBrowserTemplates.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <Separator />

            {/* Template List */}
            <div className="space-y-2">
              {filteredBrowserTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No templates match your filters</p>
                </div>
              ) : (
                filteredBrowserTemplates.map(template => (
                  <BrowserTemplateCard
                    key={template.id}
                    template={template}
                    isSelected={selectedTemplateIds.includes(template.id)}
                    isExpanded={expandedTemplateId === template.id}
                    onToggle={() => toggleTemplate(template.id)}
                    onExpand={() => setExpandedTemplateId(prev => prev === template.id ? null : template.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 z-10 bg-background border-t px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {selectedTemplateIds.length} template{selectedTemplateIds.length !== 1 ? 's' : ''} selected
          </span>
          <Separator orientation="vertical" className="h-4" />
          <WeightageBadge total={totalWeightage} />
        </div>
        <Button onClick={handleSave} disabled={isSubmitting || !formData.name.trim() || selectedTemplateIds.length === 0}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isEditMode ? 'Update Bundle' : 'Create Bundle'}
        </Button>
      </div>

      {/* Discard Changes Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate('/admin/bundles')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// --- Sub-components ---

function WeightageBadge({ total }: { total: number }) {
  const isExact = total === 100;
  const isOver = total > 100;

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${
      isExact ? 'text-green-600' : isOver ? 'text-destructive' : 'text-amber-600'
    }`}>
      {!isExact && <AlertTriangle className="h-3.5 w-3.5" />}
      Weightage: {total}%
    </span>
  );
}

function SelectedTemplateRow({
  template, index, total, onMoveUp, onMoveDown, onRemove, onEdit
}: {
  template: KpiTemplate;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-md border bg-background group">
      <div className="flex items-center gap-2 p-3">
        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm line-clamp-2">{template.title}</div>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {template.kra_name} → {template.kpi_name}
          </div>
        </div>
        {template.kra_categories && (
          <Badge variant="outline" className="text-xs flex-shrink-0" style={{
            borderColor: template.kra_categories.color || undefined,
            color: template.kra_categories.color || undefined,
          }}>
            {template.kra_categories.name}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0">
          {template.weightage || 0}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveUp} disabled={index === 0}>
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveDown} disabled={index === total - 1}>
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onRemove}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {isExpanded && (
        <div className="border-t px-3 py-3 bg-card text-card-foreground">
          <div className="rounded-lg border bg-background p-3 space-y-3">
            <div className="space-y-1 text-sm">
              <div><span className="font-medium text-muted-foreground">KRA:</span> {template.kra_name}</div>
              <div><span className="font-medium text-muted-foreground">KPI:</span> {template.kpi_name}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {template.target_value !== null && template.target_value !== undefined && (
                <div><span className="text-muted-foreground">Target:</span> <span className="font-medium">{template.target_value} {template.uom || ''}</span></div>
              )}
              {template.criteria && (
                <div><span className="text-muted-foreground">Criteria:</span> <span className="font-medium">{template.criteria}</span></div>
              )}
              {template.frequency && (
                <div><span className="text-muted-foreground">Frequency:</span> <span className="font-medium">{template.frequency}</span></div>
              )}
              {template.source_of_data && (
                <div><span className="text-muted-foreground">Source:</span> <span className="font-medium">{template.source_of_data}</span></div>
              )}
            </div>
            {(template.r5 || template.r4 || template.r3 || template.r2 || template.r1 || template.r0) && (
              <div>
                <p className="text-xs font-medium mb-1.5 text-muted-foreground">Rating Scale</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {template.r5 && <RatingCell label="R5" value={template.r5} className="text-blue-800 bg-blue-100 dark:text-blue-200 dark:bg-blue-950" />}
                  {template.r4 && <RatingCell label="R4" value={template.r4} className="text-green-800 bg-green-100 dark:text-green-200 dark:bg-green-950" />}
                  {template.r3 && <RatingCell label="R3" value={template.r3} className="text-yellow-800 bg-yellow-100 dark:text-yellow-200 dark:bg-yellow-950" />}
                  {template.r2 && <RatingCell label="R2" value={template.r2} className="text-orange-800 bg-orange-100 dark:text-orange-200 dark:bg-orange-950" />}
                  {template.r1 && <RatingCell label="R1" value={template.r1} className="text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-950" />}
                  {template.r0 && <RatingCell label="R0" value={template.r0} className="text-red-100 bg-red-900 dark:text-red-200 dark:bg-red-950" />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BrowserTemplateCard({
  template, isSelected, isExpanded, onToggle, onExpand
}: {
  template: KpiTemplate;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  return (
    <Card className={`transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`}>
      <div className="flex items-center gap-3 p-3">
        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
            isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'
          }`}>
            {isSelected && <span className="text-xs">✓</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm line-clamp-2">{template.title}</div>
            <div className="text-xs text-muted-foreground line-clamp-2">
              {template.kra_name} → {template.kpi_name}
            </div>
          </div>
          {template.kra_categories && (
            <Badge variant="outline" className="text-xs flex-shrink-0" style={{
              borderColor: template.kra_categories.color || undefined,
              color: template.kra_categories.color || undefined,
            }}>
              {template.kra_categories.name}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0">
            {template.weightage || 0}%
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0 hover:bg-accent"
          title="View details"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onExpand(); }}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-0" onClick={(e) => e.stopPropagation()}>
          <Separator className="mb-3" />
          <div className="rounded-lg border bg-background p-3 text-foreground space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <InfoRow label="UOM" value={template.uom} />
              <InfoRow label="Target" value={template.target_value != null ? String(template.target_value) : null} />
              <InfoRow label="Frequency" value={template.frequency} />
              <InfoRow label="Source" value={template.source_of_data} />
              <InfoRow label="Criteria" value={template.criteria} />
            </div>
            {(template.r5 || template.r4 || template.r3 || template.r2 || template.r1 || template.r0) && (
              <div>
                <p className="text-xs font-medium mb-1.5 text-muted-foreground">Rating Scale</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {template.r5 && <RatingCell label="R5" value={template.r5} className="text-blue-800 bg-blue-100 dark:text-blue-200 dark:bg-blue-950" />}
                  {template.r4 && <RatingCell label="R4" value={template.r4} className="text-green-800 bg-green-100 dark:text-green-200 dark:bg-green-950" />}
                  {template.r3 && <RatingCell label="R3" value={template.r3} className="text-yellow-800 bg-yellow-100 dark:text-yellow-200 dark:bg-yellow-950" />}
                  {template.r2 && <RatingCell label="R2" value={template.r2} className="text-orange-800 bg-orange-100 dark:text-orange-200 dark:bg-orange-950" />}
                  {template.r1 && <RatingCell label="R1" value={template.r1} className="text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-950" />}
                  {template.r0 && <RatingCell label="R0" value={template.r0} className="text-red-100 bg-red-900 dark:text-red-200 dark:bg-red-950" />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className="font-medium">{value}</span>
    </div>
  );
}

function RatingCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`p-2 rounded text-center min-w-[60px] ${className || ''}`}>
      <div className="font-semibold text-xs">{label}</div>
      <div className="text-xs mt-0.5 break-words" title={value}>{value}</div>
    </div>
  );
}
