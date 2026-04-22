import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Search, GraduationCap, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { toast } from '@/hooks/use-toast';
import CompetencyAssessmentDialog from './CompetencyAssessmentDialog';
import { fetchAllPaged } from '@/lib/fetchAll';

interface Profile {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  designation: string | null;
}

interface Competency {
  id: string;
  employee_id: string;
  skill_name: string;
  category: string | null;
  required_level: number | null;
  current_level: number | null;
  review_period: string | null;
  review_year: number | null;
  remarks: string | null;
}

export default function CompetencyManagerTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [search, setSearch] = useState('');
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewPeriods, setReviewPeriods] = useState<{ period_name: string; review_year: number }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const loadProfiles = async () => {
      // Paged fetch — bypasses PostgREST's 1000-row default cap so the full
      // active roster is searchable in the competency picker.
      const data = await fetchAllPaged<Profile>((from, to) =>
        supabase
          .from('profiles')
          .select('id, full_name, employee_code, designation')
          .eq('is_active', true)
          .order('full_name')
          .range(from, to)
      );
      setProfiles(data);
    };
    const loadPeriods = async () => {
      const { data } = await supabase
        .from('review_periods')
        .select('period_name, review_year')
        .order('review_year', { ascending: false });
      if (data && data.length > 0) {
        setReviewPeriods(data);
        setSelectedPeriod(data[0].period_name);
        setSelectedYear(data[0].review_year);
      }
    };
    loadProfiles();
    loadPeriods();
  }, []);

  const filteredProfiles = useMemo(() => {
    if (!search) return profiles.slice(0, 20);
    const q = search.toLowerCase();
    return profiles.filter(p =>
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.employee_code || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [profiles, search]);

  const fetchCompetencies = async (empId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('skill_competencies')
      .select('*')
      .eq('employee_id', empId)
      .eq('review_period', selectedPeriod)
      .eq('review_year', selectedYear)
      .order('category');
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setCompetencies((data as Competency[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedEmployee && selectedPeriod) fetchCompetencies(selectedEmployee);
  }, [selectedEmployee, selectedPeriod, selectedYear]);

  const selectedProfile = profiles.find(p => p.id === selectedEmployee);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('skill_competencies').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error deleting', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Competency removed' });
      fetchCompetencies(selectedEmployee);
    }
  };

  const importFromJd = async () => {
    if (!selectedProfile?.designation) {
      toast({ title: 'No designation found for this employee', variant: 'destructive' });
      return;
    }
    const { data: jd } = await supabase
      .from('employee_job_descriptions')
      .select('required_skills')
      .eq('designation', selectedProfile.designation)
      .maybeSingle();
    if (!jd || !Array.isArray(jd.required_skills) || jd.required_skills.length === 0) {
      toast({ title: 'No skills found in JD for this designation', variant: 'destructive' });
      return;
    }
    const existingSkills = new Set(competencies.map(c => c.skill_name.toLowerCase()));
    const newSkills = (jd.required_skills as string[]).filter(s => !existingSkills.has(s.toLowerCase()));
    if (newSkills.length === 0) {
      toast({ title: 'All JD skills already exist' });
      return;
    }
    const inserts = newSkills.map(s => ({
      employee_id: selectedEmployee,
      skill_name: s,
      category: 'Technical',
      required_level: 3,
      current_level: 1,
      review_period: selectedPeriod,
      review_year: selectedYear,
    }));
    const { error } = await supabase.from('skill_competencies').insert(inserts);
    if (error) {
      toast({ title: 'Error importing', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${newSkills.length} skills imported from JD` });
      fetchCompetencies(selectedEmployee);
    }
  };

  const gapColor = (req: number, cur: number) => {
    const gap = req - cur;
    if (gap <= 0) return 'text-green-600';
    if (gap === 1) return 'text-yellow-600';
    return 'text-destructive';
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
          <Select value={selectedPeriod} onValueChange={v => {
            const rp = reviewPeriods.find(p => p.period_name === v);
            if (rp) { setSelectedPeriod(rp.period_name); setSelectedYear(rp.review_year); }
          }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Review Period" /></SelectTrigger>
            <SelectContent>
              {reviewPeriods.map(rp => (
                <SelectItem key={`${rp.period_name}-${rp.review_year}`} value={rp.period_name}>
                  {rp.period_name} {rp.review_year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredProfiles.length > 0 && !selectedEmployee && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {filteredProfiles.map(p => (
              <Button key={p.id} variant="outline" size="sm" className="justify-start text-xs truncate"
                onClick={() => setSelectedEmployee(p.id)}>
                {p.full_name} {p.employee_code ? `(${p.employee_code})` : ''}
              </Button>
            ))}
          </div>
        )}

        {selectedProfile && (
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="secondary">{selectedProfile.full_name}</Badge>
            <Badge variant="outline">{selectedProfile.designation || 'No Designation'}</Badge>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedEmployee(''); setCompetencies([]); }}>Change</Button>
          </div>
        )}
      </Card>

      {/* Competency Grid */}
      {selectedEmployee && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              Competencies
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={importFromJd}>
                <Download className="h-4 w-4 mr-1" /> Import from JD
              </Button>
              <Button size="sm" onClick={() => { setEditingComp(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Skill
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : competencies.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No competencies assessed. Add skills or import from JD.</p>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Skill</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Gap</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competencies.map((c, i) => {
                      const gap = (c.required_level || 0) - (c.current_level || 0);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium text-sm">{c.skill_name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{c.category}</Badge></TableCell>
                          <TableCell className="text-sm">{c.required_level}/5</TableCell>
                          <TableCell className="text-sm">{c.current_level}/5</TableCell>
                          <TableCell className={`text-sm font-medium ${gapColor(c.required_level || 0, c.current_level || 0)}`}>
                            {gap > 0 ? `-${gap}` : gap === 0 ? 'Met' : `+${Math.abs(gap)}`}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => { setEditingComp(c); setDialogOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeletingId(c.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedEmployee && (
        <CompetencyAssessmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          employeeId={selectedEmployee}
          employeeName={selectedProfile?.full_name || 'Employee'}
          reviewPeriod={selectedPeriod}
          reviewYear={selectedYear}
          existing={editingComp}
          onSaved={() => fetchCompetencies(selectedEmployee)}
        />
      )}

      <ConfirmDestructiveDialog
        open={!!deletingId}
        onConfirm={() => { if (deletingId) handleDelete(deletingId).then(() => setDeletingId(null)); }}
        onCancel={() => setDeletingId(null)}
        title="Delete Competency"
        description="Are you sure you want to delete this competency assessment? This action cannot be undone."
        confirmLabel="Delete Competency"
      />
    </div>
  );
}
