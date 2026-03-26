import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, ListChecks, Sparkles, GraduationCap } from 'lucide-react';

interface JobDescription {
  role_purpose: string | null;
  key_responsibilities: string[];
  required_skills: string[];
  qualifications: string | null;
}

export default function JobDescriptionCard({ jd }: { jd: JobDescription | null }) {
  if (!jd) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Job Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            No job description has been configured for this designation yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Job Description
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Role Purpose */}
        {jd.role_purpose && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Role Purpose
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{jd.role_purpose}</p>
          </div>
        )}

        {/* Key Responsibilities */}
        {jd.key_responsibilities.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5 text-primary" /> Key Responsibilities
            </h4>
            <ul className="space-y-1 pl-4">
              {jd.key_responsibilities.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground list-disc leading-relaxed">{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Required Skills */}
        {jd.required_skills.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Required Skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {jd.required_skills.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Qualifications */}
        {jd.qualifications && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-primary" /> Qualifications
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{jd.qualifications}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
