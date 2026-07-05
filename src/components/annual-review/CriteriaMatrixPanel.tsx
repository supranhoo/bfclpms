import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  listCriteriaLibrary, listCriteriaAssignments,
  saveCriteriaAssignment, deleteCriteriaAssignment,
  type CriterionAssignmentRow, type CriterionRow,
} from '@/services/annualReview/criteriaLibrary';
import { useBusinessUnits, useDepartments } from '@/hooks/useSafetyOrg';
import { useBusinessUnitSubUnits } from '@/hooks/useProductionTargets';

const ARCHETYPES = ['A', 'B', 'C', 'D'] as const;
const GRADE_BUCKETS = ['M', 'W', 'T', 'other'] as const;

/**
 * Sparse-row editor for the Criteria assignment matrix. Each row scopes a
 * criterion by (archetype, grade_bucket, grade_code, dept, sub_unit).
 * Filter chips at the top narrow the visible rows. "Add row" appends a new
 * assignment; inline weight edits save on blur.
 */
export function CriteriaMatrixPanel() {
  const qc = useQueryClient();
  const { data: library = [] } = useQuery({
    queryKey: ['annual-review-criteria-library'],
    queryFn: listCriteriaLibrary,
  });
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['annual-review-criteria-assignments'],
    queryFn: listCriteriaAssignments,
  });
  const { data: businessUnits = [] } = useBusinessUnits();
  const [filterBuId, setFilterBuId] = useState('');
  const { data: departments = [] } = useDepartments(filterBuId || null);
  const { data: subUnits = [] } = useBusinessUnitSubUnits(filterBuId || undefined);

  const [filterArch, setFilterArch] = useState('');
  const [filterBucket, setFilterBucket] = useState('');
  const [filterDept, setFilterDept] = useState('');

  const critById = useMemo(
    () => new Map(library.map((c) => [c.id, c])),
    [library],
  );
  const deptName = (id: string | null) => id ? (departments.find((d) => d.id === id)?.name ?? id.slice(0, 8)) : 'Any';
  const subName = (id: string | null) => id ? (subUnits.find((s) => s.id === id)?.label ?? id.slice(0, 8)) : 'Any';

  const visible = assignments.filter((a) => {
    if (filterArch && a.archetype_code !== filterArch) return false;
    if (filterBucket && a.grade_bucket !== filterBucket) return false;
    if (filterDept && a.department_id !== filterDept) return false;
    return true;
  });

  const saveMut = useMutation({
    mutationFn: async (input: {
      row: CriterionAssignmentRow;
      weight: number;
      enabled: boolean;
    }) => saveCriteriaAssignment({
      criterion_id: input.row.criterion_id,
      archetype_code: input.row.archetype_code,
      grade_bucket: input.row.grade_bucket,
      grade_code: input.row.grade_code,
      department_id: input.row.department_id,
      sub_unit_id: input.row.sub_unit_id,
      weight_pct: input.weight,
      is_enabled: input.enabled,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annual-review-criteria-assignments'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteCriteriaAssignment(id),
    onSuccess: () => {
      toast.success('Assignment deleted.');
      qc.invalidateQueries({ queryKey: ['annual-review-criteria-assignments'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Criteria Matrix</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Assign criteria to templates by Archetype × Grade × Department × Sub-unit. Empty (Any) columns are wildcards
            and the resolver picks the most specific match at factory time. Weights per resolved cell must sum to 100 —
            the factory Preview flags failing cells.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Archetype</Label>
            <Select value={filterArch || 'any'} onValueChange={(v) => setFilterArch(v === 'any' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All</SelectItem>
                {ARCHETYPES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Grade bucket</Label>
            <Select value={filterBucket || 'any'} onValueChange={(v) => setFilterBucket(v === 'any' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All</SelectItem>
                {GRADE_BUCKETS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">BU (for dept picker)</Label>
            <Select value={filterBuId || 'any'} onValueChange={(v) => { setFilterBuId(v === 'any' ? '' : v); setFilterDept(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                {businessUnits.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Department</Label>
            <Select value={filterDept || 'any'} onValueChange={(v) => setFilterDept(v === 'any' ? '' : v)} disabled={!filterBuId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Badge variant="outline">{visible.length} rows</Badge>
          </div>
        </div>

        <AddAssignmentForm
          library={library}
          departments={departments}
          subUnits={subUnits}
          onCreated={() => qc.invalidateQueries({ queryKey: ['annual-review-criteria-assignments'] })}
        />

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No matrix rows for this filter. Use "Add row" above.
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Criterion</TableHead>
                  <TableHead className="w-20">Arch</TableHead>
                  <TableHead className="w-20">Grade</TableHead>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Sub-unit</TableHead>
                  <TableHead className="w-24 text-right">Weight %</TableHead>
                  <TableHead className="w-20 text-center">Enabled</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <AssignmentRow
                    key={r.id}
                    row={r}
                    criterionLabel={critById.get(r.criterion_id)?.label_en ?? r.criterion_id.slice(0, 8)}
                    deptName={deptName(r.department_id)}
                    subName={subName(r.sub_unit_id)}
                    onSave={(weight, enabled) => saveMut.mutate({ row: r, weight, enabled })}
                    onDelete={() => delMut.mutate(r.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentRow({
  row, criterionLabel, deptName, subName, onSave, onDelete,
}: {
  row: CriterionAssignmentRow;
  criterionLabel: string;
  deptName: string;
  subName: string;
  onSave: (weight: number, enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [weight, setWeight] = useState(String(Number(row.weight_pct) || 0));
  const [enabled, setEnabled] = useState(row.is_enabled);

  const commit = () => {
    const n = Number(weight);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error('Weight must be 0 – 100.');
      setWeight(String(Number(row.weight_pct) || 0));
      return;
    }
    if (n === Number(row.weight_pct) && enabled === row.is_enabled) return;
    onSave(n, enabled);
  };

  return (
    <TableRow>
      <TableCell className="text-sm font-medium">{criterionLabel}</TableCell>
      <TableCell className="font-mono text-xs">{row.archetype_code ?? 'any'}</TableCell>
      <TableCell className="font-mono text-xs">{row.grade_bucket ?? 'any'}</TableCell>
      <TableCell className="font-mono text-xs">{row.grade_code ?? '—'}</TableCell>
      <TableCell className="text-xs">{deptName}</TableCell>
      <TableCell className="text-xs">{subName}</TableCell>
      <TableCell className="text-right p-1">
        <Input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="h-8 text-right text-sm w-20 ml-auto"
          inputMode="decimal"
        />
      </TableCell>
      <TableCell className="text-center">
        <Checkbox
          checked={enabled}
          onCheckedChange={(v) => { setEnabled(Boolean(v)); onSave(Number(weight), Boolean(v)); }}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AddAssignmentForm({
  library, departments, subUnits, onCreated,
}: {
  library: CriterionRow[];
  departments: { id: string; name: string }[];
  subUnits: { id: string; label: string | null }[];
  onCreated: () => void;
}) {
  const [critId, setCritId] = useState('');
  const [arch, setArch] = useState('');
  const [bucket, setBucket] = useState('');
  const [code, setCode] = useState('');
  const [dept, setDept] = useState('');
  const [sub, setSub] = useState('');
  const [weight, setWeight] = useState('10');
  const [enabled, setEnabled] = useState(true);

  const addMut = useMutation({
    mutationFn: async () => {
      if (!critId) throw new Error('Pick a criterion.');
      const n = Number(weight);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Weight must be 0 – 100.');
      return saveCriteriaAssignment({
        criterion_id: critId,
        archetype_code: arch || null,
        grade_bucket: bucket || null,
        grade_code: code.trim() || null,
        department_id: dept || null,
        sub_unit_id: sub || null,
        weight_pct: n,
        is_enabled: enabled,
      });
    },
    onSuccess: () => {
      toast.success('Row added.');
      onCreated();
      setCritId(''); setWeight('10');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="border rounded p-3 grid grid-cols-1 md:grid-cols-9 gap-2 items-end bg-muted/20">
      <div className="md:col-span-2">
        <Label className="text-xs">Criterion *</Label>
        <Select value={critId} onValueChange={setCritId}>
          <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
          <SelectContent>
            {library.map((c) => <SelectItem key={c.id} value={c.id}>{c.label_en}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Arch</Label>
        <Select value={arch || 'any'} onValueChange={(v) => setArch(v === 'any' ? '' : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {ARCHETYPES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Grade</Label>
        <Select value={bucket || 'any'} onValueChange={(v) => setBucket(v === 'any' ? '' : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {GRADE_BUCKETS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Code</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="M4" className="h-9" />
      </div>
      <div>
        <Label className="text-xs">Dept</Label>
        <Select value={dept || 'any'} onValueChange={(v) => setDept(v === 'any' ? '' : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Sub-unit</Label>
        <Select value={sub || 'any'} onValueChange={(v) => setSub(v === 'any' ? '' : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {subUnits.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Weight %</Label>
        <Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className="h-9" />
      </div>
      <div>
        <Button className="w-full gap-2" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
          {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </Button>
      </div>
    </div>
  );
}