import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

import { Plus, Search, MoreHorizontal, Pencil, Trash2, Library, Target, Users, History, Copy, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { useKpiTemplates, useDeleteKpiTemplate, useLinkedKpiCounts, useCreateKpiTemplate, KpiTemplate } from '@/hooks/useKpiTemplates';
import { TemplateFormDialog } from '@/components/admin/TemplateFormDialog';
import { TemplateChangeHistory } from '@/components/admin/TemplateChangeHistory';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { useToast } from '@/hooks/use-toast';

type SortField = 'title' | 'kra_name' | 'target_value' | 'weightage' | 'frequency' | 'linked' | 'is_active';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

export default function KRALibrary() {
  const { data: templates, isLoading } = useKpiTemplates();
  const { data: linkedCounts } = useLinkedKpiCounts();
  const deleteTemplate = useDeleteKpiTemplate();
  const createTemplate = useCreateKpiTemplate();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<KpiTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<KpiTemplate | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<KpiTemplate | null>(null);
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Extract unique categories for filter
  const categories = useMemo(() => {
    const catMap = new Map<string, { id: string; name: string }>();
    templates?.forEach(t => {
      if (t.kra_categories) {
        catMap.set(t.kra_categories.id, { id: t.kra_categories.id, name: t.kra_categories.name });
      }
    });
    return Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [templates]);

  // Filter
  const filteredTemplates = useMemo(() => {
    let result = templates || [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.kra_name.toLowerCase().includes(q) ||
        t.kpi_name.toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== 'all') {
      result = result.filter(t => t.kra_categories?.id === categoryFilter);
    }
    return result;
  }, [templates, searchQuery, categoryFilter]);

  // Sort
  const sortedTemplates = useMemo(() => {
    const sorted = [...filteredTemplates];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title': cmp = a.title.localeCompare(b.title); break;
        case 'kra_name': cmp = a.kra_name.localeCompare(b.kra_name); break;
        case 'target_value': cmp = (a.target_value ?? 0) - (b.target_value ?? 0); break;
        case 'weightage': cmp = (a.weightage ?? 0) - (b.weightage ?? 0); break;
        case 'frequency': cmp = (a.frequency ?? '').localeCompare(b.frequency ?? ''); break;
        case 'linked': cmp = (linkedCounts?.[a.id] ?? 0) - (linkedCounts?.[b.id] ?? 0); break;
        case 'is_active': cmp = (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredTemplates, sortField, sortDir, linkedCounts]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedTemplates.length / PAGE_SIZE));
  const paginatedTemplates = sortedTemplates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, categoryFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const handleEdit = (template: KpiTemplate) => {
    setEditingTemplate(template);
    setIsFormOpen(true);
  };

  const handleDuplicate = async (template: KpiTemplate) => {
    try {
      const { id, created_at, updated_at, kra_categories, ...rest } = template;
      await createTemplate.mutateAsync({
        ...rest,
        title: `${template.title} (Copy)`,
        applicable_roles: rest.applicable_roles || [],
        is_active: true,
        created_by: null,
      });
      toast({ title: 'Template duplicated successfully' });
    } catch {
      // Error toast handled by the mutation's onError
    }
  };

  const handleDelete = async () => {
    if (deletingTemplate) {
      await deleteTemplate.mutateAsync(deletingTemplate.id);
      setDeletingTemplate(null);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingTemplate(null);
  };

  // Stats
  const totalTemplates = templates?.length || 0;
  const activeTemplates = templates?.filter(t => t.is_active).length || 0;
  const totalLinked = linkedCounts ? Object.values(linkedCounts).reduce((a, b) => a + b, 0) : 0;

  const deletingLinkedCount = deletingTemplate ? (linkedCounts?.[deletingTemplate.id] ?? 0) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Library className="h-6 w-6" />
          KRA Library
        </h1>
        <p className="text-muted-foreground">
          Define standard KRA/KPI templates that can be bulk-assigned to employees. Changes propagate to linked KPIs.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              {totalTemplates}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeTemplates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Linked KPIs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {totalLinked}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Template Library</CardTitle>
              <CardDescription>
                Create and manage KRA/KPI templates. Edit a template and propagate changes to linked employees.
              </CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search + Category Filter */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <TableSkeleton rows={5} columns={9} />
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort('title')}>
                        <span className="flex items-center">Template Title <SortIcon field="title" /></span>
                      </TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort('kra_name')}>
                        <span className="flex items-center">KRA / KPI <SortIcon field="kra_name" /></span>
                      </TableHead>
                      <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('target_value')}>
                        <span className="flex items-center justify-center">Target <SortIcon field="target_value" /></span>
                      </TableHead>
                      <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('weightage')}>
                        <span className="flex items-center justify-center">Weightage <SortIcon field="weightage" /></span>
                      </TableHead>
                      <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('frequency')}>
                        <span className="flex items-center justify-center">Frequency <SortIcon field="frequency" /></span>
                      </TableHead>
                      <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('linked')}>
                        <span className="flex items-center justify-center">Linked <SortIcon field="linked" /></span>
                      </TableHead>
                      <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('is_active')}>
                        <span className="flex items-center justify-center">Status <SortIcon field="is_active" /></span>
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTemplates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          {searchQuery || categoryFilter !== 'all' ? 'No templates match your filters' : 'No templates created yet'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedTemplates.map((template) => {
                        const count = linkedCounts?.[template.id] || 0;
                        return (
                          <TableRow key={template.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{template.title}</p>
                                {template.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">
                                    {template.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {template.kra_categories ? (
                                <Badge
                                  variant="outline"
                                  style={{ borderColor: template.kra_categories.color || undefined }}
                                >
                                  {template.kra_categories.name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{template.kra_name}</p>
                                <p className="text-xs text-muted-foreground">{template.kpi_name}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {template.target_value !== null ? (
                                <span className="font-mono">
                                  {template.target_value}
                                  {template.uom && <span className="text-muted-foreground ml-1">{template.uom}</span>}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {template.weightage !== null ? (
                                <span className="font-mono">{template.weightage}%</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {template.frequency ? (
                                <Badge variant="outline" className="capitalize">{template.frequency}</Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {count > 0 ? (
                                <Badge variant="secondary" className="gap-1">
                                  <Users className="h-3 w-3" />
                                  {count}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={template.is_active ? 'default' : 'secondary'}>
                                {template.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEdit(template)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit & Propagate
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setHistoryTemplate(template)}>
                                    <History className="h-4 w-4 mr-2" />
                                    View Change History
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setDeletingTemplate(template)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedTemplates.length)} of {sortedTemplates.length}
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                        .map((p, idx, arr) => {
                          const items = [];
                          if (idx > 0 && p - arr[idx - 1] > 1) {
                            items.push(<PaginationItem key={`e-${p}`}><span className="px-2 text-muted-foreground">…</span></PaginationItem>);
                          }
                          items.push(
                            <PaginationItem key={p}>
                              <PaginationLink isActive={p === currentPage} onClick={() => setCurrentPage(p)} className="cursor-pointer">
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          );
                          return items;
                        })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <TemplateFormDialog
        isOpen={isFormOpen}
        onClose={handleFormClose}
        template={editingTemplate}
      />

      {/* Change History Dialog */}
      <TemplateChangeHistory
        templateId={historyTemplate?.id || null}
        templateTitle={historyTemplate?.title || ''}
        isOpen={!!historyTemplate}
        onClose={() => setHistoryTemplate(null)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={() => setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Are you sure you want to delete "{deletingTemplate?.title}"? This action cannot be undone.</span>
              {deletingLinkedCount > 0 && (
                <span className="flex items-start gap-2 p-2 rounded bg-destructive/10 text-destructive text-sm mt-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    This template is linked to <strong>{deletingLinkedCount}</strong> KPIs. They will no longer receive propagated updates.
                  </span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
