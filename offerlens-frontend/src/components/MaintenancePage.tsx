import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * MaintenancePage Component
 * Requirements: 10.3
 * 
 * Displays when the backend is unavailable
 * Shows a user-friendly message and retry option
 */

interface MaintenancePageProps {
  onRetry?: () => void;
}

export function MaintenancePage({ onRetry }: MaintenancePageProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-warning/10 mb-6">
          <AlertCircle className="w-8 h-8 text-warning" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Service Temporarily Unavailable
        </h1>
        <p className="text-muted-foreground mb-6">
          We're experiencing technical difficulties. Our team is working to restore service as quickly as possible.
        </p>
        <div className="space-y-3">
          <Button onClick={handleRetry} variant="hero" size="lg" className="w-full">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
          <p className="text-sm text-muted-foreground">
            If the problem persists, please check back in a few minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
