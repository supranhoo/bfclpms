import { supabase } from '@/integrations/supabase/client';

export function buildAdminFunctionUrl(functionName: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
}

export async function invokeAdminEdgeFunction<T>(functionName: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(buildAdminFunctionUrl(functionName), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  const payload = raw
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return { message: raw };
        }
      })()
    : {};

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Function failed: ${response.status}`);
  }

  return payload as T;
}