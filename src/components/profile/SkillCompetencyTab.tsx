import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend } from 'recharts';
import { BarChart3, AlertTriangle } from 'lucide-react';

interface Competency {
  id: string;
  skill_name: string;
  category: string | null;
  required_level: number;
  current_level: number;
  remarks: string | null;
}

function LevelBar({ level, max = 5, color }: { level: number; max?: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <Progress value={(level / max) * 100} className={`h-2 w-20 ${color}`} />
      <span className="text-xs font-medium text-muted-foreground">{level}/{max}</span>
    </div>
  );
}

export default function SkillCompetencyTab({ competencies }: { competencies: Competency[] }) {
  if (competencies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Skill Competency Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            No skill competencies have been assessed yet. Competency assessments are managed by your reporting manager or admin.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by category for radar chart
  const categories = [...new Set(competencies.map(c => c.category || 'General'))];
  const radarData = categories.map(cat => {
    const skills = competencies.filter(c => (c.category || 'General') === cat);
    const avgRequired = skills.reduce((s, c) => s + c.required_level, 0) / skills.length;
    const avgCurrent = skills.reduce((s, c) => s + c.current_level, 0) / skills.length;
    return { category: cat, Required: +avgRequired.toFixed(1), Current: +avgCurrent.toFixed(1) };
  });

  const gapSkills = competencies.filter(c => c.current_level < c.required_level);

  return (
    <div className="space-y-6">
      {/* Radar Chart */}
      {radarData.length >= 3 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Competency Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="category" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <Radar name="Required" dataKey="Required" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.15} />
                  <Radar name="Current" dataKey="Current" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competency Matrix Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Competency Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Skill</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competencies.map(c => {
                  const gap = c.required_level - c.current_level;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-sm">{c.skill_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{c.category || 'General'}</Badge>
                      </TableCell>
                      <TableCell><LevelBar level={c.required_level} color="" /></TableCell>
                      <TableCell><LevelBar level={c.current_level} color="" /></TableCell>
                      <TableCell>
                        {gap > 0 ? (
                          <Badge variant="destructive" className="text-xs">-{gap}</Badge>
                        ) : gap === 0 ? (
                          <Badge className="bg-green-500/10 text-green-700 border-green-200 text-xs">Met</Badge>
                        ) : (
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">+{Math.abs(gap)}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Gap Analysis */}
      {gapSkills.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Gap Analysis — {gapSkills.length} skill{gapSkills.length > 1 ? 's' : ''} below required level
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gapSkills.map(s => (
                <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div>
                    <span className="text-sm font-medium text-foreground">{s.skill_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({s.category || 'General'})</span>
                  </div>
                  <span className="text-xs text-destructive font-medium">
                    Current: {s.current_level} / Required: {s.required_level}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
