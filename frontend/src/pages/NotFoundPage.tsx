import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title="Page not found"
        description="The page you're looking for doesn't exist."
        action={
          <Link to="/dashboard" className="text-sm font-medium text-blue-600 hover:underline">
            Go to dashboard
          </Link>
        }
      />
    </Card>
  );
}
