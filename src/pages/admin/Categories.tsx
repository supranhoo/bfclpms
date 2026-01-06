import { useState } from 'react';
import { useKraCategories, useCreateKraCategory, useUpdateKraCategory, useDeleteKraCategory } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { Progress } from '@/components/ui/progress';
import { Pencil, Plus, Trash2, Building2 } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  weightage: number;
  color: string | null;
  description: string | null;
  is_org_level: boolean;
  org_scoring_mode: string | null;
}

export default function Categories() {
  const { data: categories, isLoading } = useKraCategories();
  const createCategory = useCreateKraCategory();
  const updateCategory = useUpdateKraCategory();
  const deleteCategory = useDeleteKraCategory();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const [formName, setFormName] = useState('');
  const [formWeightage, setFormWeightage] = useState('');
  const [formColor, setFormColor] = useState('#3B82F6');
  const [formDescription, setFormDescription] = useState('');
  const [formIsOrgLevel, setFormIsOrgLevel] = useState(false);
  const [formOrgScoringMode, setFormOrgScoringMode] = useState<'individual' | 'uniform'>('individual');

  const totalWeightage = categories?.reduce((sum, cat) => sum + (cat.weightage || 0), 0) || 0;

  const openCreateDialog = () => {
    setEditingCategory(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormName(category.name);
    setFormWeightage(category.weightage.toString());
    setFormColor(category.color || '#3B82F6');
    setFormDescription(category.description || '');
    setFormIsOrgLevel(category.is_org_level || false);
    setFormOrgScoringMode((category.org_scoring_mode as 'individual' | 'uniform') || 'individual');
    setDialogOpen(true);
  };

  const openDeleteDialog = (category: Category) => {
    setDeletingCategory(category);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (editingCategory) {
      await updateCategory.mutateAsync({
        id: editingCategory.id,
        name: formName,
        weightage: parseFloat(formWeightage) || 0,
        color: formColor,
        description: formDescription,
        is_org_level: formIsOrgLevel,
        org_scoring_mode: formIsOrgLevel ? formOrgScoringMode : null,
      });
    } else {
      await createCategory.mutateAsync({
        name: formName,
        weightage: parseFloat(formWeightage) || 0,
        color: formColor,
        description: formDescription,
        is_org_level: formIsOrgLevel,
        org_scoring_mode: formIsOrgLevel ? formOrgScoringMode : null,
      });
    }
    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async () => {
    if (deletingCategory) {
      await deleteCategory.mutateAsync(deletingCategory.id);
      setDeleteDialogOpen(false);
      setDeletingCategory(null);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormWeightage('');
    setFormColor('#3B82F6');
    setFormDescription('');
    setFormIsOrgLevel(false);
    setFormOrgScoringMode('individual');
    setEditingCategory(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-muted animate-pulse rounded" />
          <div className="h-4 w-72 bg-muted animate-pulse rounded" />
        </div>
        <TableSkeleton rows={5} columns={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">KRA Categories</h1>
        <p className="text-muted-foreground">Manage performance review categories and weightages</p>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Weightage Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Total Weightage</span>
              <span className={totalWeightage === 100 ? 'text-green-600' : 'text-yellow-600'}>
                {totalWeightage}%
              </span>
            </div>
            <Progress value={totalWeightage} className="h-2" />
            {totalWeightage !== 100 && (
              <p className="text-sm text-yellow-600">
                Total weightage should equal 100%. Current: {totalWeightage}%
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Categories Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Categories</CardTitle>
            <CardDescription>{categories?.length || 0} categories defined</CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Color</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Weightage</TableHead>
                <TableHead className="text-center">Type</TableHead>
                <TableHead className="text-center">Scoring Mode</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories?.map(cat => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: cat.color || '#3B82F6' }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-muted-foreground">{cat.description || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={cat.weightage} className="w-20 h-2" />
                      <span>{cat.weightage}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {cat.is_org_level && (
                      <Badge variant="outline" className="gap-1">
                        <Building2 className="h-3 w-3" />
                        Org Level
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {cat.is_org_level && (
                      <Badge variant={cat.org_scoring_mode === 'uniform' ? 'default' : 'secondary'}>
                        {cat.org_scoring_mode === 'uniform' ? 'Uniform' : 'Individual'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(cat)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(cat)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit KRA Category' : 'Add KRA Category'}</DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Update the category details' : 'Create a new performance review category'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Financial Performance"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weightage (%)</Label>
                <Input
                  type="number"
                  value={formWeightage}
                  onChange={(e) => setFormWeightage(e.target.value)}
                  placeholder="e.g. 25"
                  min="0"
                  max="100"
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    placeholder="#3B82F6"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of this category..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="is_org_level" className="cursor-pointer font-medium">
                  Organization-Level KPI
                </Label>
                <p className="text-xs text-muted-foreground">
                  Data is centrally managed; employees see read-only verified values
                </p>
              </div>
              <Switch
                id="is_org_level"
                checked={formIsOrgLevel}
                onCheckedChange={setFormIsOrgLevel}
              />
            </div>

            {/* Scoring Mode - only visible when org-level is enabled */}
            {formIsOrgLevel && (
              <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Scoring Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    How scores are calculated for employees
                  </p>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scoring_mode"
                      checked={formOrgScoringMode === 'individual'}
                      onChange={() => setFormOrgScoringMode('individual')}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-sm font-medium">Individual</span>
                      <p className="text-xs text-muted-foreground">
                        Each employee's KPI uses its own thresholds (R5-R1)
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scoring_mode"
                      checked={formOrgScoringMode === 'uniform'}
                      onChange={() => setFormOrgScoringMode('uniform')}
                      className="mt-1"
                    />
                    <div>
                      <span className="text-sm font-medium">Uniform</span>
                      <p className="text-xs text-muted-foreground">
                        All employees get the same score using org-level thresholds
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSave} 
              disabled={!formName || !formWeightage || createCategory.isPending || updateCategory.isPending}
            >
              {(createCategory.isPending || updateCategory.isPending) 
                ? 'Saving...' 
                : (editingCategory ? 'Save Changes' : 'Create Category')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingCategory?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCategory.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
