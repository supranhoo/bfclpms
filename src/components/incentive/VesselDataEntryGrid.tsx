import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Ship } from 'lucide-react';
import { useVesselRates } from '@/hooks/useIncentiveVesselRates';
import { useVesselMonthlyEntries, useUpsertVesselEntries } from '@/hooks/useVesselMonthlyEntries';
import { useAuth } from '@/contexts/AuthContext';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface VesselDataEntryGridProps {
  programs: Array<{ id: string; name: string; min_kra_score: number }>;
  onMonthYearChange?: (month: string, year: number) => void;
}

export function VesselDataEntryGrid({ programs, onMonthYearChange }: VesselDataEntryGridProps) {
  const now = new Date();
  const [selectedProgram, setSelectedProgram] = useState(programs[0]?.id || '');
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());
  const { user } = useAuth();

  const { data: vesselRates = [], isLoading: ratesLoading } = useVesselRates(selectedProgram);
  const { data: existingEntries = [], isLoading: entriesLoading } = useVesselMonthlyEntries(selectedProgram, month, year);
  const upsert = useUpsertVesselEntries();

  // Local editable state keyed by employee_id
  const [localData, setLocalData] = useState<Record<string, { vessels: number; remarks: string }>>({});

  // Initialize local data when rates or entries change
  useEffect(() => {
    const entryMap = new Map((existingEntries as any[]).map((e: any) => [e.employee_id, e]));
    const init: Record<string, { vessels: number; remarks: string }> = {};
    (vesselRates as any[]).forEach((r: any) => {
      const existing = entryMap.get(r.employee_id);
      init[r.employee_id] = {
        vessels: existing?.vessels_handled ?? 0,
        remarks: existing?.remarks ?? '',
      };
    });
    setLocalData(init);
  }, [vesselRates, existingEntries]);

  useEffect(() => {
    onMonthYearChange?.(month, year);
  }, [month, year, onMonthYearChange]);

  const handleSave = () => {
    const entries = Object.entries(localData).map(([employeeId, val]) => ({
      program_id: selectedProgram,
      employee_id: employeeId,
      month,
      year,
      vessels_handled: val.vessels,
      remarks: val.remarks || undefined,
      updated_by: user?.id,
    }));
    upsert.mutate(entries as any);
  };

  const totalAmount = useMemo(() => {
    return (vesselRates as any[]).reduce((sum: number, r: any) => {
      const vessels = localData[r.employee_id]?.vessels ?? 0;
      return sum + vessels * (r.rate_per_vessel || 0);
    }, 0);
  }, [vesselRates, localData]);

  if (programs.length === 0) return null;

  const isLoading = ratesLoading || entriesLoading;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">Vessel Data Entry</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {programs.length > 1 && (
              <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {programs.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year - 1, year, year + 1].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
        ) : (vesselRates as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No employees mapped with vessel rates for this program. Configure rates in the program's "Vessel Rates" tab first.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Rate/Vessel (₹)</TableHead>
                  <TableHead className="text-right w-[120px]">Vessels Handled</TableHead>
                  <TableHead className="text-right">Total (₹)</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(vesselRates as any[]).map((r: any) => {
                  const vessels = localData[r.employee_id]?.vessels ?? 0;
                  const total = vessels * (r.rate_per_vessel || 0);
                  return (
                    <TableRow key={r.employee_id}>
                      <TableCell className="font-medium">
                        {r.profile?.full_name || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.profile?.employee_code || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(r.rate_per_vessel).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          className="w-[100px] ml-auto text-right"
                          value={vessels}
                          onChange={e =>
                            setLocalData(prev => ({
                              ...prev,
                              [r.employee_id]: {
                                ...prev[r.employee_id],
                                vessels: parseInt(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₹{total.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-[160px]"
                          placeholder="Optional"
                          value={localData[r.employee_id]?.remarks ?? ''}
                          onChange={e =>
                            setLocalData(prev => ({
                              ...prev,
                              [r.employee_id]: {
                                ...prev[r.employee_id],
                                remarks: e.target.value,
                              },
                            }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between mt-4">
              <Badge variant="secondary" className="text-sm">
                Grand Total: ₹{totalAmount.toLocaleString('en-IN')}
              </Badge>
              <Button onClick={handleSave} disabled={upsert.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {upsert.isPending ? 'Saving...' : 'Save All'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
