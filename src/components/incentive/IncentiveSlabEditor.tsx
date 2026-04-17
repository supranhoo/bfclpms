import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Trash2, Plus, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIncentiveSlabs, useUpsertSlab, useDeleteSlab } from '@/hooks/useIncentivePrograms';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SlabCategorySelector } from './SlabCategorySelector';
import { useIncentiveSlabCategories } from '@/hooks/useIncentiveSlabCategories';

interface Props {
  programId: string;
  programType: string;
}

const NONE = '__none__';

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

export function IncentiveSlabEditor({ programId, programType }: Props) {
  const { data: slabs = [], isLoading } = useIncentiveSlabs(programId);

  // Reference data
  const { data: companies = [] } = useQuery({
    queryKey: ['companies-list'],
    queryFn: async () => (await supabase.from('companies').select('id, name').order('name')).data || [],
  });
  const { data: divisions = [] } = useQuery({
    queryKey: ['divisions-list'],
    queryFn: async () => (await supabase.from('divisions').select('id, name').order('name')).data || [],
  });
  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units'],
    queryFn: async () => (await supabase.from('business_units').select('id, name').order('name')).data || [],
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => (await supabase.from('departments').select('id, name').order('name')).data || [],
  });
  const { data: designations = [] } = useQuery({
    queryKey: ['designations-list'],
    queryFn: async () => (await supabase.from('designations').select('id, name').order('name')).data || [],
  });
  const { data: pmsGrades = [] } = useQuery({
    queryKey: ['pms-grades-list'],
    queryFn: async () => (await supabase.from('pms_grades').select('id, name').order('name')).data || [],
  });

  const upsertSlab = useUpsertSlab();
  const deleteSlab = useDeleteSlab();

  const [selectedCategory, setSelectedCategory] = useState('pms_score');

  // Filter chips (top of card)
  const [fCompany, setFCompany] = useState<string | null>(null);
  const [fDivision, setFDivision] = useState<string | null>(null);
  const [fBU, setFBU] = useState<string | null>(null);
  const [fDept, setFDept] = useState<string | null>(null);
  const [fDesig, setFDesig] = useState<string | null>(null);
  const [fGrade, setFGrade] = useState<string | null>(null);

  // Add-row state
  const [newRow, setNewRow] = useState({
    company_id: '' as string,
    division_id: '' as string,
    business_unit_id: '' as string,
    department_id: '' as string,
    designation: '' as string,
    pms_grade_id: '' as string,
    location: '' as string,
    pms_level: '' as string,
    min_value: '',
    max_value: '',
    incentive_percent: '',
    rating_label: '',
    sub_category: '',
    effective_from: firstOfMonth(),
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredSlabs = (slabs as any[]).filter((s: any) => {
    if (s.slab_category !== selectedCategory) return false;
    if (fCompany && s.company_id !== fCompany) return false;
    if (fDivision && s.division_id !== fDivision) return false;
    if (fBU && s.business_unit_id !== fBU) return false;
    if (fDept && s.department_id !== fDept) return false;
    if (fGrade && s.pms_grade_id !== fGrade) return false;
    if (fDesig && !(s.applicable_designations || []).includes(fDesig)) return false;
    return true;
  });

  // Mark superseded: same scope signature, older effective_from than the latest in the group
  const scopeKey = (s: any) =>
    [s.slab_category, s.sub_category || '', s.company_id || '', s.division_id || '', s.business_unit_id || '',
     s.department_id || '', s.pms_grade_id || '', s.location || '', s.pms_level || '',
     (s.applicable_designations || []).join(','), s.min_value, s.max_value].join('|');

  const latestByScope = new Map<string, string>();
  for (const s of filteredSlabs) {
    const k = scopeKey(s);
    const cur = latestByScope.get(k);
    if (!cur || String(s.effective_from || '') > cur) latestByScope.set(k, String(s.effective_from || ''));
  }

  const handleAddSlab = () => {
    if (!newRow.min_value || !newRow.max_value) return;
    upsertSlab.mutate({
      program_id: programId,
      slab_category: selectedCategory,
      company_id: newRow.company_id || null,
      division_id: newRow.division_id || null,
      business_unit_id: newRow.business_unit_id || null,
      department_id: newRow.department_id || null,
      pms_grade_id: newRow.pms_grade_id || null,
      location: newRow.location || null,
      pms_level: newRow.pms_level || null,
      applicable_designations: newRow.designation ? [newRow.designation] : null,
      sub_category: newRow.sub_category || null,
      min_value: parseFloat(newRow.min_value),
      max_value: parseFloat(newRow.max_value),
      incentive_percent: parseFloat(newRow.incentive_percent || '0'),
      rating_label: newRow.rating_label || null,
      sort_order: filteredSlabs.length,
      effective_from: format(newRow.effective_from, 'yyyy-MM-dd'),
    }, {
      onSuccess: () => setNewRow({
        company_id: '', division_id: '', business_unit_id: '', department_id: '',
        designation: '', pms_grade_id: '', location: '', pms_level: '',
        min_value: '', max_value: '', incentive_percent: '', rating_label: '', sub_category: '',
        effective_from: firstOfMonth(),
      }),
    });
  };

  const { data: allCategories = [] } = useIncentiveSlabCategories();
  const allowedCategoryValues = programType === 'support' ? ['pms_score'] : undefined;

  const renderScopeBadges = (s: any) => {
    const items: { label: string; value: string }[] = [];
    if (s.companies?.name) items.push({ label: 'Co', value: s.companies.name });
    if (s.divisions?.name) items.push({ label: 'Div', value: s.divisions.name });
    if (s.business_units?.name) items.push({ label: 'BU', value: s.business_units.name });
    if (s.departments?.name) items.push({ label: 'Dept', value: s.departments.name });
    if ((s.applicable_designations || []).length) items.push({ label: 'Desig', value: s.applicable_designations.join(', ') });
    if (s.pms_grades?.name) items.push({ label: 'Grade', value: s.pms_grades.name });
    if (s.location) items.push({ label: 'Loc', value: s.location });
    if (s.pms_level) items.push({ label: 'Lvl', value: s.pms_level });
    if (items.length === 0) return <span className="text-muted-foreground text-xs">All</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((it, i) => (
          <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
            <span className="text-muted-foreground mr-1">{it.label}:</span>{it.value}
          </Badge>
        ))}
      </div>
    );
  };

  const colCount = selectedCategory !== 'pms_score' ? 8 : 7;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Incentive Slabs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category + filter chips */}
        <div className="flex gap-3 flex-wrap items-end">
          <SlabCategorySelector value={selectedCategory} onValueChange={setSelectedCategory} allowedValues={allowedCategoryValues} />
          <Select value={fCompany || 'all'} onValueChange={(v) => setFCompany(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fDivision || 'all'} onValueChange={(v) => setFDivision(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Division" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Divisions</SelectItem>
              {divisions.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fBU || 'all'} onValueChange={(v) => setFBU(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="BU" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All BUs</SelectItem>
              {businessUnits.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fDept || 'all'} onValueChange={(v) => setFDept(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Dept" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fDesig || 'all'} onValueChange={(v) => setFDesig(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Designation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Designations</SelectItem>
              {designations.map((d: any) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fGrade || 'all'} onValueChange={(v) => setFGrade(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Grade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {pmsGrades.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Add Slab form */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Add Slab — leave scope blank to apply to all</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Select value={newRow.company_id || NONE} onValueChange={(v) => setNewRow(p => ({ ...p, company_id: v === NONE ? '' : v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Company —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Any Company —</SelectItem>
                {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newRow.division_id || NONE} onValueChange={(v) => setNewRow(p => ({ ...p, division_id: v === NONE ? '' : v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Division —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Any Division —</SelectItem>
                {divisions.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newRow.business_unit_id || NONE} onValueChange={(v) => setNewRow(p => ({ ...p, business_unit_id: v === NONE ? '' : v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Business Unit —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Any BU —</SelectItem>
                {businessUnits.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newRow.department_id || NONE} onValueChange={(v) => setNewRow(p => ({ ...p, department_id: v === NONE ? '' : v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Department —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Any Dept —</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newRow.designation || NONE} onValueChange={(v) => setNewRow(p => ({ ...p, designation: v === NONE ? '' : v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Designation (Level) —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Any Designation —</SelectItem>
                {designations.map((d: any) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newRow.pms_grade_id || NONE} onValueChange={(v) => setNewRow(p => ({ ...p, pms_grade_id: v === NONE ? '' : v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="PMS Grade —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Any Grade —</SelectItem>
                {pmsGrades.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Location (e.g. Plant-1)" value={newRow.location} onChange={e => setNewRow(p => ({ ...p, location: e.target.value }))} className="h-9" />
            <Input placeholder="PMS Level (e.g. R-4)" value={newRow.pms_level} onChange={e => setNewRow(p => ({ ...p, pms_level: e.target.value }))} className="h-9" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
            {selectedCategory !== 'pms_score' && (
              <Input placeholder="Sub-Category (F1_F2)" value={newRow.sub_category} onChange={e => setNewRow(p => ({ ...p, sub_category: e.target.value }))} className="h-9" />
            )}
            <Input type="number" placeholder="Min" value={newRow.min_value} onChange={e => setNewRow(p => ({ ...p, min_value: e.target.value }))} className="h-9" />
            <Input type="number" placeholder="Max" value={newRow.max_value} onChange={e => setNewRow(p => ({ ...p, max_value: e.target.value }))} className="h-9" />
            <Input type="number" placeholder="Incentive %" value={newRow.incentive_percent} onChange={e => setNewRow(p => ({ ...p, incentive_percent: e.target.value }))} className="h-9" />
            <Input placeholder="Rating (R-4)" value={newRow.rating_label} onChange={e => setNewRow(p => ({ ...p, rating_label: e.target.value }))} className="h-9" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 justify-start text-left font-normal", !newRow.effective_from && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newRow.effective_from ? format(newRow.effective_from, 'dd MMM yyyy') : 'Effective from'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={newRow.effective_from} onSelect={(d) => d && setNewRow(p => ({ ...p, effective_from: d }))} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={handleAddSlab} disabled={upsertSlab.isPending} className="h-9">
              <Plus className="h-4 w-4 mr-1" /> Add Slab
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Scope</TableHead>
                {selectedCategory !== 'pms_score' && <TableHead>Sub-Cat</TableHead>}
                <TableHead>Min</TableHead>
                <TableHead>Max</TableHead>
                <TableHead>Inc %</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
              ) : filteredSlabs.length === 0 ? (
                <TableRow><TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">No slabs configured</TableCell></TableRow>
              ) : (
                filteredSlabs.map((slab: any) => {
                  const isSuperseded = String(slab.effective_from || '') < (latestByScope.get(scopeKey(slab)) || '');
                  return (
                    <TableRow key={slab.id} className={isSuperseded ? 'opacity-50' : ''}>
                      <TableCell>{renderScopeBadges(slab)}</TableCell>
                      {selectedCategory !== 'pms_score' && <TableCell>{slab.sub_category || '—'}</TableCell>}
                      <TableCell>{slab.min_value}</TableCell>
                      <TableCell>{slab.max_value}</TableCell>
                      <TableCell><Badge variant="secondary">{slab.incentive_percent}%</Badge></TableCell>
                      <TableCell>{slab.rating_label || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{slab.effective_from ? format(new Date(slab.effective_from), 'dd MMM yyyy') : '—'}</span>
                          {isSuperseded && <Badge variant="outline" className="text-[9px] px-1 py-0">superseded</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setDeletingId(slab.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <ConfirmDestructiveDialog
          open={!!deletingId}
          onConfirm={() => { if (deletingId) deleteSlab.mutate(deletingId, { onSuccess: () => setDeletingId(null) }); }}
          onCancel={() => setDeletingId(null)}
          title="Delete Incentive Slab"
          description="Are you sure you want to delete this incentive slab? This action cannot be undone."
          confirmLabel="Delete Slab"
          isLoading={deleteSlab.isPending}
        />
      </CardContent>
    </Card>
  );
}
