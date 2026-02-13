import { Skeleton } from "@/components/ui/skeleton";

interface LoadingStateProps {
  rows?: number;
  className?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ rows = 3, className }) => (
  <div className={`space-y-4 ${className ?? ""}`}>
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-20 w-full rounded-lg" />
    ))}
  </div>
);

export default LoadingState;
