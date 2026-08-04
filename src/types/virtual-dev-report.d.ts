declare module 'virtual:dev-report-capture' {
  import type { DevReportCaptureRow } from '@/lib/devReport/capture';
  export const rows: DevReportCaptureRow[];
  export const capturedAt: string;
  const _default: DevReportCaptureRow[];
  export default _default;
}