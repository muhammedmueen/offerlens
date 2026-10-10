import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QUOTA_NOTICE_ID, quotaExhaustedText, quotaRemainingText, type QuotaSnapshot } from "@/lib/quota";

interface QuotaNoticeProps {
  quota: QuotaSnapshot | undefined;
}

/**
 * Today's analysis allowance, above the upload form. Nothing for unlimited plans or while
 * loading. At zero it says when it resets and, for a guest, what an account would give.
 */
const QuotaNotice: React.FC<QuotaNoticeProps> = ({ quota }) => {
  const line = quota?.quotas.analysis;
  if (!quota || !line || line.limit === null || line.remaining === null) return null;

  if (line.remaining > 0) {
    return (
      <p role="status" className="mb-6 text-sm text-muted-foreground">
        {quotaRemainingText(line)}
      </p>
    );
  }

  const text = quotaExhaustedText(
    { feature: "analysis", limit: line.limit, used: line.used, remaining: 0, resetAt: quota.resetAt, plan: quota.plan },
    quota.accountAnalysesPerDay,
  );

  return (
    <div
      id={QUOTA_NOTICE_ID}
      role="status"
      aria-live="polite"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <p>{text}</p>
      {quota.plan === "guest" && (
        <Button asChild size="sm" className="shrink-0 cursor-pointer">
          <Link to="/signup">Create free account</Link>
        </Button>
      )}
    </div>
  );
};

export default QuotaNotice;
