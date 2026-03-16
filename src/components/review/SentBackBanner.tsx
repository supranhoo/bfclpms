import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Undo2 } from 'lucide-react';
import { format } from 'date-fns';

interface SentBackBannerProps {
  kpiId: string;
}

export function SentBackBanner({ kpiId }: SentBackBannerProps) {
  const { data: sendBackQuery } = useQuery({
    queryKey: ['send-back-reason', kpiId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_queries')
        .select('reason, created_at, raised_by_profile:raised_by(full_name)')
        .eq('kpi_id', kpiId)
        .eq('query_type', 'send_back')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!kpiId,
  });

  // Extract reason text (strip [SENT BACK] prefix)
  const rawReason = sendBackQuery?.reason || '';
  const reason = rawReason.replace(/^\[SENT BACK\]\s*/i, '');
  const senderName = (sendBackQuery?.raised_by_profile as any)?.full_name || 'Reviewer';
  const sentDate = sendBackQuery?.created_at
    ? format(new Date(sendBackQuery.created_at), 'dd MMM yyyy')
    : null;

  if (!sendBackQuery) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">
      <div className="flex items-center gap-2 font-medium">
        <Undo2 className="h-4 w-4 flex-shrink-0" />
        <span>This KPI was <strong>sent back</strong> for revision</span>
      </div>
      {reason && (
        <p className="mt-2 ml-6 italic">&ldquo;{reason}&rdquo;</p>
      )}
      <p className="mt-1 ml-6 text-xs opacity-75">
        Sent back by: {senderName}{sentDate ? ` · ${sentDate}` : ''}
      </p>
    </div>
  );
}
