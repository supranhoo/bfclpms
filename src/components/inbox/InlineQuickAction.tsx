/**
 * Inline Quick Action Panel
 * Expandable panel rendered below inbox rows for responding/accepting without navigation.
 */

import { useState } from 'react';
import { Send, CheckCircle2, X, Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { InboxItem } from '@/lib/inboxUtils';
import { cn } from '@/lib/utils';

interface InlineQuickActionProps {
  item: InboxItem;
  currentUserId: string;
  onSubmitResponse: (itemId: string, notes: string, evidenceUrl?: string) => void;
  onAcceptResponse: (item: InboxItem) => void;
  onCollapse: () => void;
  isSubmitting?: boolean;
}

export function InlineQuickAction({
  item,
  currentUserId,
  onSubmitResponse,
  onAcceptResponse,
  onCollapse,
  isSubmitting,
}: InlineQuickActionProps) {
  const [responseText, setResponseText] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);

  const isRecipient = item.toUser?.id === currentUserId;
  const isRaiser = item.fromUser?.id === currentUserId;

  // Open query → recipient can respond
  if (item.type === 'query' && item.queryStatus === 'open' && isRecipient) {
    return (
      <div className="p-4 bg-muted/30 border-t space-y-3 animate-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Quick Response
          </Label>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCollapse}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Textarea
          value={responseText}
          onChange={(e) => setResponseText(e.target.value)}
          placeholder="Type your response..."
          rows={2}
          className="text-sm resize-none"
          autoFocus
        />

        {showEvidence && (
          <EvidenceUpload
            userId={currentUserId}
            kpiId={item.id}
            existingUrl={evidenceUrl || null}
            onUploadComplete={setEvidenceUrl}
          />
        )}

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setShowEvidence(!showEvidence)}
          >
            <Paperclip className="h-3.5 w-3.5 mr-1.5" />
            {showEvidence ? 'Hide' : 'Attach Evidence'}
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCollapse}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onSubmitResponse(item.id, responseText, evidenceUrl || undefined)}
              disabled={!responseText.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              Submit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Responded query → raiser can accept
  if (item.type === 'query' && item.queryStatus === 'responded' && isRaiser) {
    return (
      <div className="p-4 bg-muted/30 border-t space-y-3 animate-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Response Received
          </Label>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCollapse}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {item.resolutionNotes && (
          <div className="p-3 bg-background rounded-md border text-sm">
            {item.resolutionNotes}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCollapse}>
            Dismiss
          </Button>
          <Button
            size="sm"
            onClick={() => onAcceptResponse(item)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Accept Response
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
