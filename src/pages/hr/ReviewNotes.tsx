import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Search, ShieldAlert } from 'lucide-react';
import { useReviewNoteAccess } from '@/hooks/useReviewNoteAccess';
import {
  useReviewNotesList,
  useSetReviewNoteStatus,
  useDeleteReviewNote,
} from '@/hooks/useReviewNotes';
import {
  REVIEW_NOTE_CATEGORY_LABELS,
  REVIEW_NOTE_PRIORITY_LABELS,
  type ReviewNoteStatus,
  type ReviewNoteCategory,
} from '@/services/reviewNotes/reviewNotesService';
import { ReviewNoteStatusPill } from '@/components/reviewNotes/ReviewNoteStatusPill';
import { useProfiles } from '@/hooks/useOrganization';
import { format } from 'date-fns';

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  high: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
};

export default function ReviewNotes() {
  const access = useReviewNoteAccess();
  const [tab, setTab] = useState<ReviewNoteStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const { data: notes = [], isLoading } = useReviewNotesList({
    status: tab === 'all' ? 'all' : tab,
    category: categoryFilter === 'all' ? undefined : (categoryFilter as ReviewNoteCategory),
    priority: priorityFilter === 'all' ? undefined : (priorityFilter as any),
    search: search.trim() || undefined,
  });

  // Counts (without status filter applied)
  const { data: allNotes = [] } = useReviewNotesList({});
  const counts = useMemo(() => {
    const c = { pending: 0, in_progress: 0, completed: 0, all: allNotes.length };
    allNotes.forEach((n) => { c[n.status]++; });
    return c;
  }, [allNotes]);

  const { data: profiles = [] } = useProfiles();
  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => m.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
    return m;
  }, [profiles]);

  const setStatus = useSetReviewNoteStatus();
  const remove = useDeleteReviewNote();

  if (!access.isLoading && !access.canView && !access.canCreate) {
    return (
      <div className="container mx-auto p-3 sm:p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-50" />
            You don't have access to HR Review Notes. Ask an admin to grant the "view" permission for your role.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">HR Review Notes & Action Tracker</CardTitle>
          <CardDescription>
            Capture KPI / KRA change inputs during PMS review and track them through to the next cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-4 w-full sm:w-auto">
              <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
              <TabsTrigger value="in_progress">In Progress ({counts.in_progress})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search title or details…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44 h-10"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {Object.entries(REVIEW_NOTE_CATEGORY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full sm:w-36 h-10"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {Object.entries(REVIEW_NOTE_PRIORITY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No notes here. Use the <strong>+ Note</strong> trigger on a scorecard or profile to add one.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Employee</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="min-w-[200px]">Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notes.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-medium">
                        {profileMap.get(n.subject_employee_id) || n.subject_employee_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {REVIEW_NOTE_CATEGORY_LABELS[n.category]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{n.title}</div>
                        {n.details && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.details}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`${PRIORITY_STYLES[n.priority]} text-xs`}>
                          {REVIEW_NOTE_PRIORITY_LABELS[n.priority]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(n.updated_at), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={n.status}
                          onValueChange={(v) => setStatus.mutate({ id: n.id, status: v as ReviewNoteStatus })}
                          disabled={!access.canEdit && setStatus.isPending}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue>
                              <ReviewNoteStatusPill status={n.status} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {access.canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm('Delete this note? This cannot be undone.')) remove.mutate(n.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}