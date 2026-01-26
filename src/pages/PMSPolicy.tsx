import { useAppSettings } from '@/hooks/useAppSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, ExternalLink, AlertCircle } from 'lucide-react';

export default function PMSPolicy() {
  const { data: appSettings, isLoading } = useAppSettings();
  
  const policyUrl = appSettings?.pms_policy_url;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">PMS Policy</h1>
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!policyUrl) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">PMS Policy</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Policy Not Configured</h3>
              <p className="text-muted-foreground max-w-md">
                The PMS Policy document has not been configured yet. Please contact your administrator to set up the policy URL in System Settings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if it's a PDF or other document type
  const isPdf = policyUrl.toLowerCase().endsWith('.pdf');
  const isGoogleDoc = policyUrl.includes('docs.google.com') || policyUrl.includes('drive.google.com');

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">PMS Policy</h1>
            <p className="text-muted-foreground">Performance Management System Policy Document</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <a href={policyUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in New Tab
          </a>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isPdf ? (
            <iframe
              src={`${policyUrl}#toolbar=1&navpanes=0`}
              className="w-full h-[800px] border-0"
              title="PMS Policy Document"
            />
          ) : isGoogleDoc ? (
            <iframe
              src={policyUrl.includes('/preview') ? policyUrl : `${policyUrl}?embedded=true`}
              className="w-full h-[800px] border-0"
              title="PMS Policy Document"
            />
          ) : (
            <iframe
              src={policyUrl}
              className="w-full h-[800px] border-0"
              title="PMS Policy Document"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
