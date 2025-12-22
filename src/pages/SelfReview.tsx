import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useAllKpis, useReviewSubmissions, useSubmitSelfReview, RatingLevel, KPI } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
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
import { Progress } from '@/components/ui/progress';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { Send, Eye, CheckCircle2, Clock, AlertCircle, Filter, User, Paperclip } from 'lucide-react';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'Pending Review',
  self_review: 'Submitted',
  manager_check: 'Under Manager Review',
  audit: 'Under Audit',
  approved: 'Approved',
};

const ratingOptions: { value: RatingLevel; label: string; color: string; score: number }[] = [
  { value: 'blue', label: 'Outstanding (5)', color: '#3B82F6', score: 5 },
  { value: 'green', label: 'Exceeds Expectations (4)', color: '#10B981', score: 4 },
  { value: 'yellow', label: 'Meets Expectations (3)', color: '#F59E0B', score: 3 },
  { value: 'red', label: 'Below Expectations (1-2)', color: '#EF4444', score: 2 },
];

export default function SelfReview() {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  
  // Fetch KPIs based on role
  const { data: myKpis, isLoading: loadingMyKpis } = useMyKpis();
  const { data: allKpisRaw, isLoading: loadingAllKpis } = useAllKpis();
  
  const allKpis = useMemo(() => {
    if (!allKpisRaw) return [];
    return allKpisRaw.map(k => ({
      ...k,
      employee: k.profiles as { id: string; full_name: string | null; email: string; employee_code: string | null } | null
    }));
  }, [allKpisRaw]);

  const kpis = isAdmin ? allKpis : myKpis;
  const isLoading = isAdmin ? loadingAllKpis : loadingMyKpis;
  
  const { data: categories } = useKraCategories();
  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const submitReview = useSubmitSelfReview();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  
  // Review form state
  const [achievedValue, setAchievedValue] = useState('');
  const [selfRating, setSelfRating] = useState<RatingLevel | ''>('');
  const [selfRemarks, setSelfRemarks] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);

  // Get unique employees for admin filter
  const employees = useMemo(() => {
    if (!isAdmin || !allKpis) return [];
    const employeeMap = new Map<string, { id: string; name: string; code: string | null }>();
    allKpis.forEach(k => {
      if (k.employee && !employeeMap.has(k.employee.id)) {
        employeeMap.set(k.employee.id, {
          id: k.employee.id,
          name: k.employee.full_name || k.employee.email,
          code: k.employee.employee_code
        });
      }
    });
    return Array.from(employeeMap.values());
  }, [isAdmin, allKpis]);

  // Filter KPIs
  const filteredKpis = useMemo(() => {
    let filtered = kpis || [];
    if (selectedCategory) {
      filtered = filtered.filter(k => k.category_id === selectedCategory);
    }
    if (isAdmin && selectedEmployee) {
      filtered = filtered.filter(k => k.employee_id === selectedEmployee);
    }
    // Only show KPIs that are pending self review or already submitted
    return filtered.filter(k => k.status === 'kra_set' || k.status === 'self_review');
  }, [kpis, selectedCategory, selectedEmployee, isAdmin]);

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  // Calculate progress
  const totalKpis = kpis?.filter(k => k.status === 'kra_set' || k.status === 'self_review').length || 0;
  const submittedKpis = kpis?.filter(k => k.status === 'self_review').length || 0;
  const progressPercent = totalKpis > 0 ? (submittedKpis / totalKpis) * 100 : 0;

  const openReviewDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    if (existing) {
      setAchievedValue(existing.achieved_value?.toString() || '');
      setSelfRating(existing.self_rating || '');
      setSelfRemarks(existing.self_remarks || '');
      setEvidenceUrl(existing.self_evidence_url || null);
    } else {
      setAchievedValue('');
      setSelfRating('');
      setSelfRemarks('');
      setEvidenceUrl(null);
    }
    setReviewDialogOpen(true);
  };

  const openViewDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setViewDialogOpen(true);
  };

  // Auto-calculate rating based on achieved value
  const calculateSuggestedRating = (achieved: number, kpi: KPI): RatingLevel | null => {
    if (!kpi.target_value) return null;
    
    const thresholds: RatingThresholds = {
      r5: kpi.r5,
      r4: kpi.r4,
      r3: kpi.r3,
      r2: kpi.r2,
      r1: kpi.r1,
      r0: kpi.r0
    };
    
    const result = calculateRating(achieved, kpi.target_value, thresholds, kpi.criteria || 'Higher is Better', kpi.weightage || 0);
    return result.ratingLevel;
  };

  const handleAchievedChange = (value: string) => {
    setAchievedValue(value);
    if (selectedKpi && value) {
      const suggested = calculateSuggestedRating(parseFloat(value), selectedKpi);
      if (suggested) {
        setSelfRating(suggested);
      }
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedKpi || !selfRating) return;

    const scoreMap: Record<RatingLevel, number> = {
      blue: 5,
      green: 4,
      yellow: 3,
      red: 2
    };

    await submitReview.mutateAsync({
      kpi_id: selectedKpi.id,
      achieved_value: parseFloat(achievedValue) || 0,
      self_rating: selfRating,
      self_score: scoreMap[selfRating],
      self_remarks: selfRemarks,
      self_evidence_url: evidenceUrl,
    });

    setReviewDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Self Review</h1>
        <p className="text-muted-foreground">
          {isAdmin ? 'View and manage employee self-assessments' : 'Submit your self-assessment for each KPI'}
        </p>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="font-medium">Review Progress</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {submittedKpis} of {totalKpis} KPIs reviewed
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{totalKpis - submittedKpis} Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>{submittedKpis} Submitted</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All Categories
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

        {/* Employee Filter (Admin only) */}
        {isAdmin && employees.length > 0 && (
          <Select value={selectedEmployee || 'all'} onValueChange={(v) => setSelectedEmployee(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[250px]">
              <User className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map(emp => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name} {emp.code && `(${emp.code})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPIs Table */}
      <Card>
        <CardHeader>
          <CardTitle>KPIs for Self Review</CardTitle>
          <CardDescription>
            {filteredKpis?.length || 0} KPIs {selectedCategory || selectedEmployee ? 'matching filters' : 'pending review'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead>Employee</TableHead>}
                <TableHead>Category</TableHead>
                <TableHead>KRA</TableHead>
                <TableHead>KPI</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Weightage</TableHead>
                <TableHead>Achieved</TableHead>
                <TableHead>Self Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKpis?.map(kpi => {
                const submission = submissionMap.get(kpi.id);
                const employee = isAdmin && 'employee' in kpi ? (kpi as any).employee : null;
                return (
                  <TableRow key={kpi.id}>
                    {isAdmin && (
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{employee?.full_name || '-'}</div>
                          <div className="text-muted-foreground text-xs">{employee?.employee_code}</div>
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: kpi.kra_categories?.color }}
                        />
                        <span className="text-sm">{kpi.kra_categories?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium max-w-[150px] truncate" title={kpi.kra_name}>
                      {kpi.kra_name}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={kpi.kpi_name}>
                      {kpi.kpi_name}
                    </TableCell>
                    <TableCell>
                      {kpi.target_value} {kpi.uom && <span className="text-muted-foreground text-xs">({kpi.uom})</span>}
                    </TableCell>
                    <TableCell>{kpi.weightage}%</TableCell>
                    <TableCell>
                      {submission?.achieved_value !== null && submission?.achieved_value !== undefined ? (
                        <span className="font-medium">{submission.achieved_value}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {submission?.self_rating ? (
                        <Badge
                          style={{
                            backgroundColor: ratingOptions.find(r => r.value === submission.self_rating)?.color,
                          }}
                          className="text-white"
                        >
                          {ratingOptions.find(r => r.value === submission.self_rating)?.label.split(' ')[0]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[kpi.status]}>
                        {statusLabels[kpi.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {kpi.status === 'kra_set' && (
                          <Button
                            size="sm"
                            onClick={() => openReviewDialog(kpi)}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Submit
                          </Button>
                        )}
                        {kpi.status === 'self_review' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReviewDialog(kpi)}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openViewDialog(kpi)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!filteredKpis || filteredKpis.length === 0) && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 10 : 9} className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No KPIs pending self review
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Self Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Submit Self Review</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{selectedKpi?.kra_name}</span> - {selectedKpi?.kpi_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* KPI Details */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-xs text-muted-foreground">Target</Label>
                <p className="font-medium">{selectedKpi?.target_value} {selectedKpi?.uom}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Criteria</Label>
                <p className="font-medium text-sm">{selectedKpi?.criteria || 'Higher is Better'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Weightage</Label>
                <p className="font-medium">{selectedKpi?.weightage}%</p>
              </div>
            </div>

            {/* Rating Scale Reference */}
            {selectedKpi && (selectedKpi.r5 || selectedKpi.r4 || selectedKpi.r3) && (
              <div className="p-4 border rounded-lg space-y-2">
                <Label className="text-sm font-medium">Rating Scale</Label>
                <div className="grid gap-1 text-sm">
                  {selectedKpi.r5 && <div className="flex justify-between"><span className="text-blue-600">R5 (Outstanding):</span> <span>{selectedKpi.r5}</span></div>}
                  {selectedKpi.r4 && <div className="flex justify-between"><span className="text-green-600">R4 (Exceeds):</span> <span>{selectedKpi.r4}</span></div>}
                  {selectedKpi.r3 && <div className="flex justify-between"><span className="text-yellow-600">R3 (Meets):</span> <span>{selectedKpi.r3}</span></div>}
                  {selectedKpi.r2 && <div className="flex justify-between"><span className="text-orange-600">R2 (Below):</span> <span>{selectedKpi.r2}</span></div>}
                  {selectedKpi.r1 && <div className="flex justify-between"><span className="text-red-600">R1 (Poor):</span> <span>{selectedKpi.r1}</span></div>}
                </div>
              </div>
            )}

            {/* Achieved Value */}
            <div className="space-y-2">
              <Label htmlFor="achieved">Achieved Value *</Label>
              <Input
                id="achieved"
                type="number"
                value={achievedValue}
                onChange={(e) => handleAchievedChange(e.target.value)}
                placeholder="Enter your achieved value"
              />
              {achievedValue && selectedKpi?.target_value && (
                <p className="text-sm text-muted-foreground">
                  Achievement: {((parseFloat(achievedValue) / selectedKpi.target_value) * 100).toFixed(1)}% of target
                </p>
              )}
            </div>
            
            {/* Self Rating */}
            <div className="space-y-2">
              <Label htmlFor="rating">Self Rating *</Label>
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

            {/* Self Remarks */}
            <div className="space-y-2">
              <Label htmlFor="remarks">Justification & Evidence</Label>
              <Textarea
                id="remarks"
                value={selfRemarks}
                onChange={(e) => setSelfRemarks(e.target.value)}
                placeholder="Describe your achievements, provide evidence or justification for your rating..."
                rows={4}
              />
            </div>

            {/* Evidence File Upload */}
            {user && selectedKpi && (
              <EvidenceUpload
                userId={user.id}
                kpiId={selectedKpi.id}
                existingUrl={evidenceUrl}
                onUploadComplete={(url) => setEvidenceUrl(url || null)}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitReview} 
              disabled={!selfRating || !achievedValue || submitReview.isPending}
            >
              {submitReview.isPending ? 'Submitting...' : 'Submit Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View KPI Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>KPI Details</DialogTitle>
            <DialogDescription>
              {selectedKpi?.kra_categories?.name} - {selectedKpi?.kra_name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedKpi && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">KPI Name</Label>
                  <p className="font-medium">{selectedKpi.kpi_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Target</Label>
                  <p className="font-medium">{selectedKpi.target_value} {selectedKpi.uom}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Criteria</Label>
                  <p className="font-medium">{selectedKpi.criteria || 'Higher is Better'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Weightage</Label>
                  <p className="font-medium">{selectedKpi.weightage}%</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Frequency</Label>
                  <p className="font-medium">{selectedKpi.frequency || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Source of Data</Label>
                  <p className="font-medium">{selectedKpi.source_of_data || '-'}</p>
                </div>
              </div>

              {submissionMap.get(selectedKpi.id) && (
                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-medium">Self Review Submission</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Achieved Value</Label>
                      <p className="font-medium">{submissionMap.get(selectedKpi.id)?.achieved_value}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Self Rating</Label>
                      <Badge
                        style={{
                          backgroundColor: ratingOptions.find(r => r.value === submissionMap.get(selectedKpi.id)?.self_rating)?.color,
                        }}
                        className="text-white"
                      >
                        {ratingOptions.find(r => r.value === submissionMap.get(selectedKpi.id)?.self_rating)?.label}
                      </Badge>
                    </div>
                  </div>
                  {submissionMap.get(selectedKpi.id)?.self_remarks && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Self Remarks</Label>
                      <p className="text-sm mt-1">{submissionMap.get(selectedKpi.id)?.self_remarks}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
