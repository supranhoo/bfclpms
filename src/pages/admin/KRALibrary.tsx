import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { Plus, Search, MoreHorizontal, Pencil, Trash2, Library, Target, Users, History } from 'lucide-react';
import { useKpiTemplates, useDeleteKpiTemplate, useLinkedKpiCounts, KpiTemplate } from '@/hooks/useKpiTemplates';
import { TemplateFormDialog } from '@/components/admin/TemplateFormDialog';
import { TemplateChangeHistory } from '@/components/admin/TemplateChangeHistory';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';

export default function KRALibrary() {
  const { data: templates, isLoading } = useKpiTemplates();
  const { data: linkedCounts } = useLinkedKpiCounts();
  const deleteTemplate = useDeleteKpiTemplate();

  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<KpiTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<KpiTemplate | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<KpiTemplate | null>(null);

  const filteredTemplates = templates?.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.kra_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.kpi_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleEdit = (template: KpiTemplate) => {
    setEditingTemplate(template);
    setIsFormOpen(true);
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
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 max-w-sm"
            />
          </div>

          {/* Table */}
          {isLoading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>KRA / KPI</TableHead>
                    <TableHead className="text-center">Target</TableHead>
                    <TableHead className="text-center">Linked</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {searchQuery ? 'No templates match your search' : 'No templates created yet'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTemplates.map((template) => {
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
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTemplate?.title}"? This action cannot be undone.
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
