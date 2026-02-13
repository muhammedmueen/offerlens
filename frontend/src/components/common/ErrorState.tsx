import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ message = "Something went wrong. Please try again.", onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
    <AlertTriangle className="h-12 w-12 text-destructive" />
    <p className="text-muted-foreground">{message}</p>
    {onRetry && (
      <Button variant="outline" onClick={onRetry} className="cursor-pointer">
        Try again
      </Button>
    )}
  </div>
);

export default ErrorState;
