import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  actionTo?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, actionLabel, actionTo }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <Inbox className="h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-md">{description}</p>}
      {actionLabel && actionTo && (
        <Button onClick={() => navigate(actionTo)} className="cursor-pointer brand-gradient text-primary-foreground hover:opacity-90 rounded-xl skeu-btn">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
