import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Briefcase, Shield, FileText, ExternalLink, MessageSquare } from 'lucide-react';
import { ReviewSubmission } from '@/hooks/useKpis';
import { getScoreBadgeClass, getScoreLabel } from '@/lib/reviewConstants';
import { openStorageFile } from '@/lib/storageDownload';

interface PreviousLevelRemarksProps {
  submission: ReviewSubmission | null | undefined;
  showSelf?: boolean;
  showManager?: boolean;
  showAuditor?: boolean;
}

const scoreToLabel = (score: number | null | undefined): string => getScoreLabel(score);

interface RemarkItemProps {
  icon: typeof User;
  iconColor: string;
  borderColor: string;
  bgColor: string;
  title: string;
  score: number | null | undefined;
  remarks: string | null | undefined;
  evidenceUrl: string | null | undefined;
  isNa?: boolean;
}

function RemarkItem({ icon: Icon, iconColor, borderColor, bgColor, title, score, remarks, evidenceUrl, isNa }: RemarkItemProps) {
  return (
    <div className={`p-3 rounded-lg border ${borderColor} ${bgColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full ${iconColor} flex items-center justify-center`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        {isNa ? (
          <Badge variant="outline">N/A</Badge>
        ) : score !== null && score !== undefined ? (
          <Badge className={getScoreBadgeClass(score)}>
            {score} - {scoreToLabel(score)}
          </Badge>
        ) : (
          <Badge variant="outline">Pending</Badge>
        )}
      </div>
      
      {remarks && (
        <div className="mt-2 pl-8">
          <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p className="line-clamp-3">{remarks}</p>
          </div>
        </div>
      )}
      
      {!remarks && (
        <p className="text-xs text-muted-foreground pl-8 italic">No remarks provided</p>
      )}
      
      {evidenceUrl && (
        <div className="mt-2 pl-8">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); void openStorageFile(evidenceUrl); }}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <FileText className="h-3 w-3" />
            View Evidence
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function PreviousLevelRemarks({ 
  submission, 
  showSelf = true,
  showManager = false,
  showAuditor = false,
}: PreviousLevelRemarksProps) {
  if (!submission) return null;

  const hasAnyRemarks = (showSelf && submission.self_remarks) || 
                        (showManager && submission.manager_remarks) ||
                        (showAuditor && submission.auditor_remarks);
  
  const hasAnyData = (showSelf && submission.self_score != null) ||
                     (showManager && submission.manager_score != null) ||
                     (showAuditor && submission.auditor_score != null);
  
  if (!hasAnyData) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Previous Review Levels
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showSelf && submission.self_score != null && (
          <RemarkItem
            icon={User}
            iconColor="bg-blue-500/10 text-blue-500"
            borderColor="border-blue-200 dark:border-blue-800"
            bgColor="bg-blue-50/50 dark:bg-blue-950/20"
            title="Self Review"
            score={submission.self_score}
            remarks={submission.self_remarks}
            evidenceUrl={submission.self_evidence_url}
            isNa={submission.is_na}
          />
        )}
        
        {showManager && submission.manager_score != null && (
          <RemarkItem
            icon={Briefcase}
            iconColor="bg-amber-500/10 text-amber-500"
            borderColor="border-amber-200 dark:border-amber-800"
            bgColor="bg-amber-50/50 dark:bg-amber-950/20"
            title="Manager Review"
            score={submission.manager_score}
            remarks={submission.manager_remarks}
            evidenceUrl={submission.manager_evidence_url}
            isNa={submission.is_na}
          />
        )}
        
        {showAuditor && submission.auditor_score != null && (
          <RemarkItem
            icon={Shield}
            iconColor="bg-purple-500/10 text-purple-500"
            borderColor="border-purple-200 dark:border-purple-800"
            bgColor="bg-purple-50/50 dark:bg-purple-950/20"
            title="Auditor Review"
            score={submission.auditor_score}
            remarks={submission.auditor_remarks}
            evidenceUrl={submission.auditor_evidence_url}
            isNa={submission.is_na}
          />
        )}
      </CardContent>
    </Card>
  );
}
