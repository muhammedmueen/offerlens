import { Link } from "react-router-dom";
import { Clock } from "lucide-react";

interface GuestBannerProps {
  expiresAt?: string;
}

const GuestBanner: React.FC<GuestBannerProps> = ({ expiresAt }) => {
  const hoursLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3600000))
    : null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center gap-3 text-sm">
      {hoursLeft !== null && (
        <div className="flex items-center gap-1 text-primary font-medium">
          <Clock className="h-4 w-4" />
          {hoursLeft}h left
        </div>
      )}
      <p className="text-muted-foreground flex-1">
        Sign up to save this analysis, compare offers, and get negotiation scripts.
      </p>
      <Link
        to="/signup"
        className="whitespace-nowrap font-medium text-primary hover:underline cursor-pointer"
      >
        Create Free Account
      </Link>
    </div>
  );
};

export default GuestBanner;
