import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * MyKpis page is now merged into Dashboard.
 * This component redirects all traffic (including deep-links) to /dashboard.
 */
export default function MyKpis() {
  // Forward query params (e.g., ?kpi=xxx&panel=queryHistory) to dashboard
  const [searchParams] = useSearchParams();
  const kpi = searchParams.get('kpi');
  const panel = searchParams.get('panel');

  let target = '/dashboard';
  const params = new URLSearchParams();
  if (kpi) params.set('kpi', kpi);
  if (panel) params.set('panel', panel);
  const qs = params.toString();
  if (qs) target += `?${qs}`;

  return <Navigate to={target} replace />;
}
