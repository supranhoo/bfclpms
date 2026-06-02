import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useResolvedMenu } from '@/hooks/useResolvedMenu';
import { Info } from 'lucide-react';

/**
 * Default placeholder page for admin-created custom menu items whose
 * destination is "Custom Page". Route: `/custom-menu/:menuKey`.
 */
export default function CustomMenuPage() {
  const { menuKey = '' } = useParams<{ menuKey: string }>();
  const { data: resolved } = useResolvedMenu();
  const node = resolved?.byKey[menuKey];

  const title = node?.label ?? 'Custom page';

  return (
    <div className="container mx-auto p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5" />
            <div>
              <p>This is a custom menu page reserved for content.</p>
              <p className="text-xs mt-1">menu_key: <code className="px-1 py-0.5 rounded bg-muted">{menuKey}</code></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}