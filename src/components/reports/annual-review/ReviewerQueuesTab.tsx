import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Row = {
  reviewer_id: string | null;
  reviewer_name: string;
  stage: 'manager' | 'skip' | 'dept_head' | 'bu_head' | 'hr';
  pending_count: number;
  oldest_days: number;
};

export function ReviewerQueuesTab({ cycleId }: { cycleId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!cycleId) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc('get_annual_review_reviewer_pending_queues', { p_cycle_id: cycleId });
      if (cancelled) return;
      if (error) { toast.error(error.message); setRows([]); }
      else setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cycleId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r =>
      (stageFilter === 'all' || r.stage === stageFilter) &&
      (s === '' || r.reviewer_name.toLowerCase().includes(s))
    );
  }, [rows, stageFilter, search]);

  if (!cycleId) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">Pick a cycle to view reviewer pending queues.</CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="skip">Skip</SelectItem>
              <SelectItem value="dept_head">Dept Head</SelectItem>
              <SelectItem value="bu_head">BU Head</SelectItem>
              <SelectItem value="hr">HR</SelectItem>
            </SelectContent>
          </Select>
          <Input className="w-56 h-9" placeholder="Search reviewer…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <p className="ml-auto text-sm text-muted-foreground">{loading ? 'Loading…' : `${filtered.length} reviewer(s)`}</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reviewer</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Oldest (days)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={`${r.reviewer_id}-${r.stage}`}>
                  <TableCell className="font-medium">{r.reviewer_name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.stage.replace('_',' ')}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{r.pending_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.oldest_days}</TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No pending queues.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}