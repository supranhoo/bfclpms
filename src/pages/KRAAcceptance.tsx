import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions, KPI } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProfileCardSkeleton, TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { ProfileCard } from '@/components/dashboard/ProfileCard';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function KRAAcceptance() {
  const { profile } = useAuth();
  const { data: kpis, isLoading } = useMyKpis();
  const { data: categories } = useKraCategories();
  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [confirmedKpis, setConfirmedKpis] = useState<Set<string>>(new Set());

  // Filter only KPIs that are in 'kra_set' status (need acceptance)
  const pendingKpis = kpis?.filter(k => k.status === 'kra_set') || [];

  const acceptKRAs = useMutation({
    mutationFn: async () => {
      const updatePromises = pendingKpis.map(kpi => 
        supabase
          .from('kpis')
          .update({ status: 'self_review' as const })
          .eq('id', kpi.id)
      );
      
      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error('Failed to accept some KRAs');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      toast({ title: 'KRAs Accepted', description: 'You can now submit your self-review.' });
      setConfirmedKpis(new Set());
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to accept KRAs', description: error.message, variant: 'destructive' });
    },
  });

  const handleToggleConfirmation = (kpiId: string) => {
    setConfirmedKpis(prev => {
      const newSet = new Set(prev);
      if (newSet.has(kpiId)) {
        newSet.delete(kpiId);
      } else {
        newSet.add(kpiId);
      }
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    if (areAllConfirmed) {
      setConfirmedKpis(new Set());
    } else {
      setConfirmedKpis(new Set(pendingKpis.map(k => k.id)));
    }
  };

  const areAllConfirmed = pendingKpis.length > 0 && confirmedKpis.size === pendingKpis.length;
  const totalWeightage = pendingKpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);

  // Group KPIs by category
  const groupedByCategory = pendingKpis.reduce((acc, kpi) => {
    const catName = kpi.kra_categories?.name || 'Uncategorized';
    if (!acc[catName]) {
      acc[catName] = { kpis: [], color: kpi.kra_categories?.color || '#6B7280' };
    }
    acc[catName].kpis.push(kpi);
    return acc;
  }, {} as Record<string, { kpis: KPI[]; color: string }>);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <ProfileCardSkeleton />
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  if (pendingKpis.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">KRA Acceptance</h1>
          <p className="text-muted-foreground mt-2">Review and accept your assigned KRAs</p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-foreground">All KRAs Accepted</h2>
            <p className="text-muted-foreground mt-2">
              You have no pending KRAs to accept. You can proceed to self-review.
            </p>
            <Button className="mt-4" onClick={() => window.location.href = '/self-review'}>
              Go to Self Review
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Key Responsibility Area (KRA) Agreement</h1>
        <p className="text-lg text-muted-foreground mt-2">
          For the period of <span className="font-semibold">{pendingKpis[0]?.review_period || 'Current Period'}</span>
        </p>
        <p className="mt-1 text-muted-foreground">
          Please review the following KRAs and KPIs assigned to you. Once reviewed, please accept them at the bottom of the page.
        </p>
      </div>

      {/* Profile Section */}
      <ProfileCard
        profile={{
          full_name: profile?.full_name,
          designation: profile?.designation,
          employee_code: profile?.employee_code,
          avatar_url: profile?.avatar_url,
          email: profile?.email,
        }}
      />

      {/* KRA Details by Category */}
      {Object.entries(groupedByCategory).map(([catName, { kpis: catKpis, color }]) => (
        <Card key={catName}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
              <CardTitle>{catName}</CardTitle>
              <Badge variant="secondary">{catKpis.length} KPIs</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={catKpis.every(k => confirmedKpis.has(k.id))}
                      onCheckedChange={() => {
                        const allInCat = catKpis.every(k => confirmedKpis.has(k.id));
                        const newSet = new Set(confirmedKpis);
                        catKpis.forEach(k => {
                          if (allInCat) {
                            newSet.delete(k.id);
                          } else {
                            newSet.add(k.id);
                          }
                        });
                        setConfirmedKpis(newSet);
                      }}
                    />
                  </TableHead>
                  <TableHead>KRA / KPI</TableHead>
                  <TableHead className="text-center">Target</TableHead>
                  <TableHead className="text-center">UOM</TableHead>
                  <TableHead className="text-center">Weightage</TableHead>
                  <TableHead className="text-center">Frequency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catKpis.map(kpi => (
                  <TableRow 
                    key={kpi.id} 
                    className={confirmedKpis.has(kpi.id) ? 'bg-green-50 dark:bg-green-950/20' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={confirmedKpis.has(kpi.id)}
                        onCheckedChange={() => handleToggleConfirmation(kpi.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-foreground">{kpi.kra_name}</p>
                        <p className="text-sm text-muted-foreground">{kpi.kpi_name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">{kpi.target_value || '-'}</TableCell>
                    <TableCell className="text-center">{kpi.uom || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{kpi.weightage}%</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">{kpi.frequency || 'Monthly'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Total Weightage Summary */}
      <div className="flex justify-end">
        <Card className="w-auto">
          <CardContent className="py-4 px-6">
            <span className="text-lg font-bold text-foreground">
              Total Weightage: {totalWeightage.toFixed(2)}%
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Acceptance Section */}
      <Card>
        <CardHeader>
          <CardTitle>Acceptance & Confirmation</CardTitle>
          <CardDescription>
            Please review and confirm each KRA by checking the box next to it. Once all KRAs are confirmed, you can accept the agreement.
            By clicking "Accept Agreement", you confirm that you have reviewed, understood, and agree to all confirmed KRAs and KPIs.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button
            size="lg"
            onClick={() => acceptKRAs.mutate()}
            disabled={!areAllConfirmed || acceptKRAs.isPending}
            className="px-8"
          >
            {acceptKRAs.isPending 
              ? 'Accepting...' 
              : `Accept Agreement (${confirmedKpis.size}/${pendingKpis.length} Confirmed)`
            }
          </Button>
          {!areAllConfirmed && (
            <p className="text-sm text-muted-foreground mt-3 flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Please confirm all KPIs to accept the agreement
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
