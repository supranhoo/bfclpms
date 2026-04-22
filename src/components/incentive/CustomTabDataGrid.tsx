import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Trash2, Save, X, Settings, Plus } from 'lucide-react';
import { useCustomTabData, useUpsertCustomTabData, useDeleteCustomTabData } from '@/hooks/useIncentiveCustomTabs';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import type { CustomTab, CustomTabField } from '@/hooks/useIncentiveCustomTabs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';

interface Props {
  tab: CustomTab;
  programId: string;
  onEditTab: () => void;
  onDeleteTab: () => void;
}

export function CustomTabDataGrid({ tab, programId, onEditTab, onDeleteTab }: Props) {
  const { data: rows = [], isLoading } = useCustomTabData(tab.id, programId);
  const upsert = useUpsertCustomTabData();
  const deleteRow = useDeleteCustomTabData();

  const [addMode, setAddMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch mapped employees for this program
  const { data: mappedEmployees = [] } = useQuery({
    queryKey: ['program-mapped-employees-for-custom-tab', programId],
    queryFn: async () => {
      const { data: mappings } = await supabase
        .from('incentive_program_mappings')
        .select('mapping_type, mapping_value')
        .eq('program_id', programId);

      const employeeIds = (mappings || [])
        .filter((m: any) => m.mapping_type === 'employee')
        .map((m: any) => m.mapping_value);

      if (employeeIds.length === 0) {
        const data = await fetchAllPaged<any>((from, to) =>
          supabase
            .from('profiles')
            .select('id, full_name, employee_code')
            .eq('is_active', true)
            .order('full_name')
            .range(from, to)
        );
        return data;
      }

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .in('id', employeeIds)
        .order('full_name') as { data: any[] | null };
      return data || [];
    },
  });

  const fields = tab.fields || [];

  const initFieldValues = (existing?: Record<string, any>) => {
    const vals: Record<string, any> = {};
    fields.forEach(f => {
      vals[f.key] = existing?.[f.key] ?? f.default_value ?? (f.type === 'number' ? 0 : f.type === 'boolean' ? false : '');
    });
    return vals;
  };

  const startAdd = () => {
    setAddMode(true);
    setSelectedEmployee('');
    setFieldValues(initFieldValues());
  };

  const startEdit = (row: any) => {
    setEditId(row.id);
    setSelectedEmployee(row.employee_id);
    setFieldValues(initFieldValues(row.field_values));
  };

  const cancelEdit = () => {
    setAddMode(false);
    setEditId(null);
  };

  const handleSave = () => {
    if (!selectedEmployee) return;
    upsert.mutate(
      {
        id: editId || undefined,
        tab_id: tab.id,
        program_id: programId,
        employee_id: selectedEmployee,
        field_values: fieldValues,
      },
      { onSuccess: () => cancelEdit() }
    );
  };

  const renderFieldInput = (field: CustomTabField, value: any, onChange: (v: any) => void) => {
    switch (field.type) {
      case 'number':
        return (
          <Input
            type="number"
            className="w-28"
            value={value ?? ''}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
          />
        );
      case 'boolean':
        return <Switch checked={!!value} onCheckedChange={onChange} />;
      case 'date':
        return (
          <Input
            type="date"
            className="w-36"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
          />
        );
      default:
        return (
          <Input
            className="w-36"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
          />
        );
    }
  };

  const renderFieldValue = (field: CustomTabField, value: any) => {
    if (field.type === 'boolean') return value ? 'Yes' : 'No';
    return value ?? '—';
  };

  // Employees already used in existing rows (except the one being edited)
  const usedEmployeeIds = new Set(
    rows.filter(r => r.id !== editId).map(r => r.employee_id)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{tab.tab_label}</h4>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEditTab}>
            <Settings className="h-3.5 w-3.5 mr-1" /> Edit Tab
          </Button>
          <Button variant="outline" size="sm" onClick={onDeleteTab} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Tab
          </Button>
          {!addMode && (
            <Button size="sm" onClick={startAdd}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
            </Button>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            {fields.map(f => (
              <TableHead key={f.key}>{f.label}</TableHead>
            ))}
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {addMode && (
            <TableRow>
              <TableCell>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {mappedEmployees
                      .filter((e: any) => !usedEmployeeIds.has(e.id))
                      .map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name} {e.employee_code ? `(${e.employee_code})` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </TableCell>
              {fields.map(f => (
                <TableCell key={f.key}>
                  {renderFieldInput(f, fieldValues[f.key], v =>
                    setFieldValues(prev => ({ ...prev, [f.key]: v }))
                  )}
                </TableCell>
              ))}
              <TableCell>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={handleSave} disabled={upsert.isPending}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}

          {isLoading ? (
            <TableRow>
              <TableCell colSpan={fields.length + 2} className="text-center text-muted-foreground py-6">
                Loading...
              </TableCell>
            </TableRow>
          ) : rows.length === 0 && !addMode ? (
            <TableRow>
              <TableCell colSpan={fields.length + 2} className="text-center text-muted-foreground py-6">
                No data yet. Click "Add Row" to get started.
              </TableCell>
            </TableRow>
          ) : (
            rows.map(row => (
              <TableRow key={row.id}>
                {editId === row.id ? (
                  <>
                    <TableCell className="font-medium">
                      {row.employee_name} {row.employee_code ? `(${row.employee_code})` : ''}
                    </TableCell>
                    {fields.map(f => (
                      <TableCell key={f.key}>
                        {renderFieldInput(f, fieldValues[f.key], v =>
                          setFieldValues(prev => ({ ...prev, [f.key]: v }))
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={handleSave} disabled={upsert.isPending}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={cancelEdit}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-medium">
                      {row.employee_name} {row.employee_code ? `(${row.employee_code})` : ''}
                    </TableCell>
                    {fields.map(f => (
                      <TableCell key={f.key}>
                        {renderFieldValue(f, row.field_values?.[f.key])}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => startEdit(row)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingId(row.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <ConfirmDestructiveDialog
        open={!!deletingId}
        onConfirm={() => { if (deletingId) deleteRow.mutate({ id: deletingId, tabId: tab.id }, { onSuccess: () => setDeletingId(null) }); }}
        onCancel={() => setDeletingId(null)}
        title="Delete Row"
        description="Are you sure you want to delete this data row? This action cannot be undone."
        confirmLabel="Delete Row"
        isLoading={deleteRow.isPending}
      />
    </div>
  );
}
