import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplateBundles, useDeleteTemplateBundle, useDuplicateTemplateBundle, TemplateBundle } from '@/hooks/useTemplateBundles';
import { BundleFormDialog } from '@/components/admin/BundleFormDialog';
import { BundleAssignDialog } from '@/components/admin/BundleAssignDialog';
import { BundleHistoryDialog } from '@/components/admin/BundleHistoryDialog';
import { Plus, Package, MoreHorizontal, Pencil, Trash2, Users, FileText, CheckCircle, XCircle, Copy, History, Wand2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function TemplateBundles() {
  const navigate = useNavigate();
  const { data: bundles, isLoading } = useTemplateBundles();
  const deleteBundle = useDeleteTemplateBundle();
  const duplicateBundle = useDuplicateTemplateBundle();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<TemplateBundle | null>(null);
  const [deletingBundle, setDeletingBundle] = useState<TemplateBundle | null>(null);
  const [historyBundle, setHistoryBundle] = useState<TemplateBundle | null>(null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleEdit = (bundle: TemplateBundle) => {
    setEditingBundle(bundle);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingBundle(null);
  };

  const handleDelete = () => {
    if (deletingBundle) {
      deleteBundle.mutate(deletingBundle.id);
      setDeletingBundle(null);
    }
  };

  const handleDuplicate = (bundle: TemplateBundle) => {
    duplicateBundle.mutate(bundle.id);
  };

  const handleViewHistory = (bundle: TemplateBundle | null) => {
    setHistoryBundle(bundle);
    setIsHistoryOpen(true);
  };

  const handleGenerateFromKpis = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_bundles_from_kpis');
      if (error) throw error;
      const result = data as { templates_created: number; bundles_created: number; links_created: number };
      queryClient.invalidateQueries({ queryKey: ['template-bundles'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-templates'] });
      toast({
        title: 'Bundles generated successfully',
        description: `Created ${result.templates_created} templates, ${result.bundles_created} bundles, and ${result.links_created} links.`,
      });
    } catch (error: any) {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
      setShowGenerateConfirm(false);
    }
  };

  // Stats
  const totalBundles = bundles?.length || 0;
  const activeBundles = bundles?.filter(b => b.is_active).length || 0;
  const totalTemplatesInBundles = bundles?.reduce((sum, b) => sum + (b.template_bundle_items?.length || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="KRA Bundles"
        description="Create and manage KRA bundles for fast employee onboarding"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowGenerateConfirm(true)} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Generate from KPIs
            </Button>
            <Button variant="outline" onClick={() => handleViewHistory(null)}>
              <History className="mr-2 h-4 w-4" />
              Assignment History
            </Button>
            <Button variant="outline" onClick={() => setIsAssignOpen(true)}>
              <Users className="mr-2 h-4 w-4" />
              Assign Bundle
            </Button>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Bundle
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bundles</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBundles}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bundles</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeBundles}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Templates in Bundles</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTemplatesInBundles}</div>
          </CardContent>
        </Card>
      </div>

      {/* Bundles Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Bundles</CardTitle>
        </CardHeader>
        <CardContent>
          {bundles?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No bundles created yet</p>
              <p className="text-sm">Create your first bundle to speed up employee onboarding</p>
              <Button className="mt-4" onClick={() => setIsFormOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Bundle
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bundle Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead className="text-center">Templates</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles?.map((bundle) => (
                  <TableRow key={bundle.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{bundle.name}</div>
                        {bundle.description && (
                          <div className="text-sm text-muted-foreground truncate max-w-xs">
                            {bundle.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {bundle.departments?.name || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {bundle.designation || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {bundle.template_bundle_items?.length || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {bundle.is_active ? (
                        <Badge variant="default">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(bundle)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(bundle)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewHistory(bundle)}>
                            <History className="h-4 w-4 mr-2" />
                            View History
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingBundle(bundle)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <BundleFormDialog
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        bundle={editingBundle}
      />

      {/* Assign Dialog */}
      <BundleAssignDialog
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
      />

      {/* History Dialog */}
      <BundleHistoryDialog
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        bundle={historyBundle}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBundle} onOpenChange={() => setDeletingBundle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bundle</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingBundle?.name}"? This action cannot be undone.
              Existing KPIs assigned from this bundle will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Generate from KPIs Confirmation */}
      <AlertDialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Bundles from Existing KPIs</AlertDialogTitle>
            <AlertDialogDescription>
              This will analyze all assigned KPIs and automatically create KPI templates and bundles for each unique department + designation combination. Existing bundles and templates will not be modified or duplicated. This operation is safe to run multiple times.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isGenerating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateFromKpis} disabled={isGenerating}>
              {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> : 'Generate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
