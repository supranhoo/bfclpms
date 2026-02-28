import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MentionUser {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
}

export function useMentionSearch(query: string) {
  const [results, setResults] = useState<MentionUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < 1) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, employee_code')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5);

        if (!error && data) {
          setResults(data as MentionUser[]);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return { results, isLoading };
}
