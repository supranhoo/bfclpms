import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MessageCircle, Send, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { openStorageFile } from '@/lib/storageDownload';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { MentionTextarea } from '@/components/ui/MentionTextarea';
import { renderMentionText } from '@/lib/mentionUtils';
import {
  useObservationReplies,
  useCreateObservationReply,
  useResolveObservation,
} from '@/hooks/useObservationReplies';
import { useAuth } from '@/contexts/AuthContext';

interface ObservationReplyThreadProps {
  observationId: string;
  kpiId: string;
  observationCreatedBy: string;
  isReadOnly: boolean;
}

export function ObservationReplyThread({
  observationId,
  kpiId,
  observationCreatedBy,
  isReadOnly,
}: ObservationReplyThreadProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [replyEvidenceUrls, setReplyEvidenceUrls] = useState<string[]>([]);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);

  const { data: replies = [], isLoading } = useObservationReplies(observationId);
  const createReplyMutation = useCreateObservationReply();
  const resolveMutation = useResolveObservation();

  const isRaiser = user?.id === observationCreatedBy;
  const replyCount = replies.length;

  const handleSubmitReply = () => {
    if (!replyText.trim()) return;
    createReplyMutation.mutate(
      {
        observationId,
        replyText: replyText.trim(),
        evidenceUrls: replyEvidenceUrls.length > 0 ? replyEvidenceUrls : undefined,
        mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
      },
      {
        onSuccess: () => {
          setReplyText('');
          setReplyEvidenceUrls([]);
          setShowReplyForm(false);
          setMentionedUserIds([]);
        },
      }
    );
  };

  const handleResolve = () => {
    resolveMutation.mutate({ observationId, kpiId });
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2 pt-1">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
            <MessageCircle className="h-3 w-3" />
            {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? 'Reply' : 'Replies'}` : 'Replies'}
            {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>

        {!isReadOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setIsOpen(true);
              setShowReplyForm(true);
            }}
          >
            <Send className="h-3 w-3 mr-1" />
            Reply
          </Button>
        )}

        {isRaiser && !isReadOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-emerald-600 hover:text-emerald-700"
            onClick={handleResolve}
            disabled={resolveMutation.isPending}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Mark Resolved
          </Button>
        )}
      </div>

      <CollapsibleContent className="pt-2 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : replies.length === 0 && !showReplyForm ? (
          <p className="text-xs text-muted-foreground py-2">No replies yet.</p>
        ) : (
          <div className="space-y-2 border-l-2 border-border pl-3">
            {replies.map((reply) => (
              <div key={reply.id} className="flex gap-2">
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(reply.reply_by_profile?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium">
                      {reply.reply_by_profile?.full_name || reply.reply_by_profile?.email || 'Unknown'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(reply.created_at), 'dd MMM yyyy, HH:mm')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {renderMentionText(reply.reply_text)}
                  </p>
                  {reply.evidence_urls && reply.evidence_urls.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {reply.evidence_urls.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => openStorageFile(url as string)}
                          className="text-[10px] text-primary hover:underline"
                        >
                          Attachment {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reply Form */}
        {showReplyForm && !isReadOnly && (
          <div className="space-y-2 pt-1">
            <MentionTextarea
              value={replyText}
              onChange={setReplyText}
              onMentionsChange={setMentionedUserIds}
              placeholder="Write a reply — @ to mention"
              rows={2}
              className="text-sm"
              kpiId={kpiId}
            />
            {user && (
              <MultiFileUpload
                userId={user.id}
                contextId={observationId}
                folder="observation-replies"
                existingUrls={replyEvidenceUrls}
                onUploadComplete={setReplyEvidenceUrls}
                maxFiles={3}
                label="Attachments"
              />
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmitReply}
                disabled={!replyText.trim() || createReplyMutation.isPending}
              >
                {createReplyMutation.isPending ? 'Posting...' : 'Post Reply'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowReplyForm(false);
                  setReplyText('');
                  setReplyEvidenceUrls([]);
                  setMentionedUserIds([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
