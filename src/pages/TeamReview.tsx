import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useOrganization';
import { useKpisByEmployee, useReviewSubmissions, RatingLevel } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, CheckCircle2, Clock, ArrowRight } from 'lucide-react';

const statusColors = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  audit: 'Audit',
  approved: 'Approved',
};

const ratingOptions: { value: RatingLevel; label: string; color: string }[] = [
  { value: 'red', label: 'Below Expectations', color: '#EF4444' },
  { value: 'yellow', label: 'Meets Expectations', color: '#F59E0B' },
  { value: 'green', label: 'Exceeds Expectations', color: '#10B981' },
  { value: 'blue', label: 'Outstanding', color: '#3B82F6' },
];

function TeamMemberKpis({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { data: kpis, isLoading } = useKpisByEmployee(memberId);
  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<typeof kpis extends (infer T)[] ? T : never | null>(null);
  const [managerRating, setManagerRating] = useState<RatingLevel | ''>('');
  const [managerRemarks, setManagerRemarks] = useState('');

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  const submitManagerReview = useMutation({
    mutationFn: async ({
      kpi_id,
      manager_rating,
      manager_score,
      manager_remarks,
    }: {
      kpi_id: string;
      manager_rating: RatingLevel;
      manager_score: number;
      manager_remarks: string;
    }) => {
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          manager_rating,
          manager_score,
          manager_remarks,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: 'manager_check' as const })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'Manager review submitted' });
      setReviewDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' });
    },
  });

  const openReviewDialog = (kpi: NonNullable<typeof kpis>[number]) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    setManagerRating(existing?.manager_rating || '');
    setManagerRemarks(existing?.manager_remarks || '');
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = () => {
    if (!selectedKpi || !managerRating) return;
    const score = managerRating === 'blue' ? 100 : managerRating === 'green' ? 80 : managerRating === 'yellow' ? 60 : 40;
    submitManagerReview.mutate({
      kpi_id: selectedKpi.id,
      manager_rating: managerRating,
      manager_score: score,
      manager_remarks: managerRemarks,
    });
  };

  const pendingReviewKpis = kpis?.filter(k => k.status === 'self_review') || [];

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{memberName}'s KPIs</h3>
        <Badge variant="outline">
          {pendingReviewKpis.length} pending review
        </Badge>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>KRA / KPI</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Achieved</TableHead>
            <TableHead>Self Rating</TableHead>
            <TableHead>Manager Rating</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {kpis?.map(kpi => {
            const submission = submissionMap.get(kpi.id);
            return (
              <TableRow key={kpi.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: kpi.kra_categories?.color }}
                    />
                    <span className="text-sm">{kpi.kra_categories?.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{kpi.kra_name}</p>
                    <p className="text-sm text-muted-foreground">{kpi.kpi_name}</p>
                  </div>
                </TableCell>
                <TableCell>{kpi.target_value}</TableCell>
                <TableCell>{submission?.achieved_value || '-'}</TableCell>
                <TableCell>
                  {submission?.self_rating ? (
                    <Badge
                      style={{
                        backgroundColor: ratingOptions.find(r => r.value === submission.self_rating)?.color,
                      }}
                      className="text-white"
                    >
                      {ratingOptions.find(r => r.value === submission.self_rating)?.label}
                    </Badge>
                  ) : '-'}
                </TableCell>
                <TableCell>
                  {submission?.manager_rating ? (
                    <Badge
                      style={{
                        backgroundColor: ratingOptions.find(r => r.value === submission.manager_rating)?.color,
                      }}
                      className="text-white"
                    >
                      {ratingOptions.find(r => r.value === submission.manager_rating)?.label}
                    </Badge>
                  ) : '-'}
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[kpi.status]}>
                    {statusLabels[kpi.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {kpi.status === 'self_review' && (
                    <Button size="sm" onClick={() => openReviewDialog(kpi)}>
                      Review
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manager Review</DialogTitle>
            <DialogDescription>
              {selectedKpi?.kpi_name} - {selectedKpi?.kra_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-muted-foreground">Self Rating</Label>
                <p className="font-medium">
                  {submissionMap.get(selectedKpi?.id || '')?.self_rating || 'N/A'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Self Remarks</Label>
                <p className="text-sm">
                  {submissionMap.get(selectedKpi?.id || '')?.self_remarks || 'N/A'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Manager Rating</Label>
              <Select value={managerRating} onValueChange={(v) => setManagerRating(v as RatingLevel)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select rating" />
                </SelectTrigger>
                <SelectContent>
                  {ratingOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: opt.color }} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Manager Remarks</Label>
              <Textarea
                value={managerRemarks}
                onChange={(e) => setManagerRemarks(e.target.value)}
                placeholder="Enter your remarks..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitReview} disabled={!managerRating || submitManagerReview.isPending}>
              {submitManagerReview.isPending ? 'Submitting...' : 'Submit Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TeamReview() {
  const { user } = useAuth();
  const { data: teamMembers, isLoading } = useTeamMembers(user?.id);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Team Review</h1>
        <p className="text-muted-foreground">Review and manage your team's performance</p>
      </div>

      {/* Team Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Team Size</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{teamMembers?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>Select a team member to review their KPIs</CardDescription>
        </CardHeader>
        <CardContent>
          {teamMembers && teamMembers.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {teamMembers.map(member => (
                <Card
                  key={member.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedMember === member.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedMember(member.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{member.full_name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {member.designation || member.email}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No team members found</p>
              <p className="text-sm">You don't have any direct reports assigned</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Member KPIs */}
      {selectedMember && (
        <Card>
          <CardHeader>
            <CardTitle>KPI Review</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamMemberKpis
              memberId={selectedMember}
              memberName={teamMembers?.find(m => m.id === selectedMember)?.full_name || 'Team Member'}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
