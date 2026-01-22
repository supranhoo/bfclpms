import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplateBundles, useDeleteTemplateBundle, TemplateBundle } from '@/hooks/useTemplateBundles';
import { BundleFormDialog } from '@/components/admin/BundleFormDialog';
import { BundleAssignDialog } from '@/components/admin/BundleAssignDialog';
import { Plus, Package, MoreHorizontal, Pencil, Trash2, Users, FileText, CheckCircle, XCircle } from 'lucide-react';

export default function TemplateBundles() {
  const { data: bundles, isLoading } = useTemplateBundles();
  const deleteBundle = useDeleteTemplateBundle();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<TemplateBundle | null>(null);
  const [deletingBundle, setDeletingBundle] = useState<TemplateBundle | null>(null);

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
    </div>
  );
}
