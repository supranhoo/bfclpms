import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Pencil, Plus, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import JdFormDialog from './JdFormDialog';
import type { Json } from '@/integrations/supabase/types';

interface DesignationJd {
  designation: string;
  jd: {
    id: string;
    role_purpose: string | null;
    key_responsibilities: Json;
    required_skills: Json;
    qualifications: string | null;
  } | null;
}

export default function JdManagerTab() {
  const [data, setData] = useState<DesignationJd[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDesignation, setSelectedDesignation] = useState('');
  const [selectedJd, setSelectedJd] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [desRes, jdRes] = await Promise.all([
        supabase.from('designations').select('name').order('name'),
        supabase.from('employee_job_descriptions').select('*'),
      ]);
      if (desRes.error) throw desRes.error;
      if (jdRes.error) throw jdRes.error;

      const jdMap = new Map(jdRes.data.map(j => [j.designation, j]));
      const merged: DesignationJd[] = desRes.data.map(d => ({
        designation: d.name,
        jd: jdMap.get(d.name) || null,
      }));
      setData(merged);
    } catch (err: any) {
      toast({ title: 'Error loading data', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const configuredCount = data.filter(d => d.jd).length;
  const coveragePercent = data.length > 0 ? Math.round((configuredCount / data.length) * 100) : 0;

  const openDialog = (designation: string, jd: any) => {
    setSelectedDesignation(designation);
    setSelectedJd(jd ? {
      id: jd.id,
      role_purpose: jd.role_purpose,
      key_responsibilities: Array.isArray(jd.key_responsibilities) ? jd.key_responsibilities : [],
      required_skills: Array.isArray(jd.required_skills) ? jd.required_skills : [],
      qualifications: jd.qualifications,
    } : null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">JD Coverage</p>
            <p className="text-lg font-semibold text-foreground">{configuredCount} of {data.length} designations configured</p>
          </div>
          <div className="w-48">
            <Progress value={coveragePercent} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1 text-right">{coveragePercent}%</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Job Descriptions by Designation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Responsibilities</TableHead>
                    <TableHead>Skills</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row, i) => (
                    <TableRow key={row.designation}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{row.designation}</TableCell>
                      <TableCell>
                        <Badge variant={row.jd ? 'default' : 'outline'} className="text-xs">
                          {row.jd ? 'Configured' : 'Not Configured'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.jd && Array.isArray(row.jd.key_responsibilities) ? row.jd.key_responsibilities.length : 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.jd && Array.isArray(row.jd.required_skills) ? row.jd.required_skills.length : 0}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openDialog(row.designation, row.jd)}>
                          {row.jd ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <JdFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        designation={selectedDesignation}
        existing={selectedJd}
        onSaved={fetchData}
      />
    </div>
  );
}
