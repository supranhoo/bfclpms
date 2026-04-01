import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Check, X, Settings, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import {
  useIncentiveSlabCategories,
  useCreateSlabCategory,
  useUpdateSlabCategory,
  useDeleteSlabCategory,
} from '@/hooks/useIncentiveSlabCategories';

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  allowedValues?: string[];
}

export function SlabCategorySelector({ value, onValueChange, allowedValues }: Props) {
  const { data: categories = [] } = useIncentiveSlabCategories();
  const createCategory = useCreateSlabCategory();
  const updateCategory = useUpdateSlabCategory();
  const deleteCategory = useDeleteSlabCategory();

  const [showInput, setShowInput] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [addingInManage, setAddingInManage] = useState(false);
  const [manageNewLabel, setManageNewLabel] = useState('');
  const [deletingCat, setDeletingCat] = useState<any>(null);

  const filtered = allowedValues
    ? categories.filter((c: any) => allowedValues.includes(c.value))
    : categories;

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const val = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    createCategory.mutate({ value: val, label }, {
      onSuccess: () => {
        onValueChange(val);
        setNewLabel('');
        setShowInput(false);
      },
    });
  };

  const handleManageAdd = () => {
    const label = manageNewLabel.trim();
    if (!label) return;
    const val = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    createCategory.mutate({ value: val, label }, {
      onSuccess: () => {
        setManageNewLabel('');
        setAddingInManage(false);
      },
    });
  };

  const handleUpdate = (id: string) => {
    const label = editLabel.trim();
    if (!label) return;
    updateCategory.mutate({ id, label }, {
      onSuccess: () => setEditingId(null),
    });
  };

  const handleDelete = (cat: any) => {
    deleteCategory.mutate(cat.id, {
      onSuccess: () => {
        if (value === cat.value) {
          const remaining = categories.filter((c: any) => c.id !== cat.id);
          onValueChange(remaining.length > 0 ? remaining[0].value : '');
        }
      },
    });
  };

  if (showInput) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="e.g. Safety Score"
          className="h-9"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button size="icon" variant="outline" onClick={handleAdd} disabled={!newLabel.trim() || createCategory.isPending} className="h-9 w-9 shrink-0">
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => { setShowInput(false); setNewLabel(''); }} className="h-9 w-9 shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v) => {
        if (v === '__ADD_NEW__') {
          setShowInput(true);
        } else {
          onValueChange(v);
        }
      }}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select category" /></SelectTrigger>
        <SelectContent>
          {filtered.map((c: any) => (
            <SelectItem key={c.id} value={c.value}>{c.label}</SelectItem>
          ))}
          <SelectItem value="__ADD_NEW__">
            <span className="flex items-center gap-1 text-primary">
              <Plus className="h-3.5 w-3.5" /> Add New Category
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Popover open={manageOpen} onOpenChange={setManageOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" title="Manage Categories">
            <Settings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="px-4 py-3 border-b">
            <h4 className="text-sm font-semibold">Manage Slab Categories</h4>
          </div>
          <div className="divide-y max-h-64 overflow-auto">
            {categories.map((cat: any) => (
              <div key={cat.id} className="flex items-center gap-2 px-4 py-2">
                {editingId === cat.id ? (
                  <>
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="h-8 flex-1"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdate(cat.id)}
                    />
                    <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => handleUpdate(cat.id)} disabled={!editLabel.trim() || updateCategory.isPending}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm truncate">{cat.label}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setEditingId(cat.id); setEditLabel(cat.label); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => handleDelete(cat)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t">
            {addingInManage ? (
              <div className="flex items-center gap-2">
                <Input
                  value={manageNewLabel}
                  onChange={(e) => setManageNewLabel(e.target.value)}
                  placeholder="e.g. Safety Score"
                  className="h-8 flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleManageAdd()}
                />
                <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={handleManageAdd} disabled={!manageNewLabel.trim() || createCategory.isPending}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setAddingInManage(false); setManageNewLabel(''); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setAddingInManage(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add New Category
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
