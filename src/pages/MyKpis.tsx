import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions, useSubmitSelfReview, RatingLevel } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Filter, Send, Eye } from 'lucide-react';

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

export default function MyKpis() {
  const { data: kpis, isLoading } = useMyKpis();
  const { data: categories } = useKraCategories();
  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const submitReview = useSubmitSelfReview();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<typeof kpis extends (infer T)[] ? T : never | null>(null);
  
  // Review form state
  const [achievedValue, setAchievedValue] = useState('');
  const [selfRating, setSelfRating] = useState<RatingLevel | ''>('');
  const [selfRemarks, setSelfRemarks] = useState('');

  const filteredKpis = selectedCategory
    ? kpis?.filter(k => k.category_id === selectedCategory)
    : kpis;

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  const openReviewDialog = (kpi: NonNullable<typeof kpis>[number]) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    if (existing) {
      setAchievedValue(existing.achieved_value?.toString() || '');
      setSelfRating(existing.self_rating || '');
      setSelfRemarks(existing.self_remarks || '');
    } else {
      setAchievedValue('');
      setSelfRating('');
      setSelfRemarks('');
    }
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!selectedKpi || !selfRating) return;

    const score = selfRating === 'blue' ? 100 : selfRating === 'green' ? 80 : selfRating === 'yellow' ? 60 : 40;

    await submitReview.mutateAsync({
      kpi_id: selectedKpi.id,
      achieved_value: parseFloat(achievedValue) || 0,
      self_rating: selfRating,
      self_score: score,
      self_remarks: selfRemarks,
    });

    setReviewDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My KPIs</h1>
        <p className="text-muted-foreground">View and manage your performance indicators</p>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCategory === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory(null)}
        >
          All
        </Button>
        {categories?.map(cat => (
          <Button
            key={cat.id}
            variant={selectedCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(cat.id)}
            style={{
              borderColor: selectedCategory === cat.id ? cat.color : undefined,
              backgroundColor: selectedCategory === cat.id ? cat.color : undefined,
            }}
          >
            <div
              className="w-2 h-2 rounded-full mr-2"
              style={{ backgroundColor: selectedCategory === cat.id ? 'white' : cat.color }}
            />
            {cat.name}
          </Button>
        ))}
      </div>

      {/* KPIs Table */}
      <Card>
        <CardHeader>
          <CardTitle>KPI Details</CardTitle>
          <CardDescription>
            {filteredKpis?.length || 0} KPIs found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>KRA</TableHead>
                <TableHead>KPI</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead>Achieved</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKpis?.map(kpi => {
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
                    <TableCell className="font-medium">{kpi.kra_name}</TableCell>
                    <TableCell>{kpi.kpi_name}</TableCell>
                    <TableCell>{kpi.target_value}</TableCell>
                    <TableCell>{kpi.uom || '-'}</TableCell>
                    <TableCell>{submission?.achieved_value || '-'}</TableCell>
                    <TableCell>
                      {submission?.final_rating || submission?.self_rating ? (
                        <Badge
                          style={{
                            backgroundColor: ratingOptions.find(
                              r => r.value === (submission?.final_rating || submission?.self_rating)
                            )?.color,
                          }}
                          className="text-white"
                        >
                          {ratingOptions.find(
                            r => r.value === (submission?.final_rating || submission?.self_rating)
                          )?.label}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[kpi.status]}>
                        {statusLabels[kpi.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {kpi.status === 'kra_set' || kpi.status === 'self_review' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openReviewDialog(kpi)}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          {kpi.status === 'kra_set' ? 'Submit' : 'Edit'}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost">
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!filteredKpis || filteredKpis.length === 0) && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No KPIs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Self Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Submit Self Review</DialogTitle>
            <DialogDescription>
              {selectedKpi?.kpi_name} - {selectedKpi?.kra_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target</Label>
                <Input value={selectedKpi?.target_value || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="achieved">Achieved Value</Label>
                <Input
                  id="achieved"
                  type="number"
                  value={achievedValue}
                  onChange={(e) => setAchievedValue(e.target.value)}
                  placeholder="Enter achieved value"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="rating">Self Rating</Label>
              <Select value={selfRating} onValueChange={(v) => setSelfRating(v as RatingLevel)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your rating" />
                </SelectTrigger>
                <SelectContent>
                  {ratingOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: opt.color }}
                        />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remarks">Self Remarks</Label>
              <Textarea
                id="remarks"
                value={selfRemarks}
                onChange={(e) => setSelfRemarks(e.target.value)}
                placeholder="Describe your achievements and provide justification..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitReview} disabled={!selfRating || submitReview.isPending}>
              {submitReview.isPending ? 'Submitting...' : 'Submit Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
