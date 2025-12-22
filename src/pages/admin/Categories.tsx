import { useState } from 'react';
import { useKraCategories, useCreateKraCategory } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ClipboardList, Plus } from 'lucide-react';

export default function Categories() {
  const { data: categories, isLoading } = useKraCategories();
  const createCategory = useCreateKraCategory();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formWeightage, setFormWeightage] = useState('');
  const [formColor, setFormColor] = useState('#3B82F6');
  const [formDescription, setFormDescription] = useState('');

  const totalWeightage = categories?.reduce((sum, cat) => sum + (cat.weightage || 0), 0) || 0;

  const handleCreate = async () => {
    await createCategory.mutateAsync({
      name: formName,
      weightage: parseFloat(formWeightage) || 0,
      color: formColor,
      description: formDescription,
    });
    setDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormName('');
    setFormWeightage('');
    setFormColor('#3B82F6');
    setFormDescription('');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
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
          <Button onClick={() => setDialogOpen(true)}>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add KRA Category</DialogTitle>
            <DialogDescription>Create a new performance review category</DialogDescription>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formName || !formWeightage || createCategory.isPending}>
              {createCategory.isPending ? 'Creating...' : 'Create Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
