import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import CareerTimeline from "@/components/charts/CareerTimeline";
import { getQuotaError, quotaExhaustedText } from "@/lib/quota";

/**
 * Career path drawer.
 *
 * The API returns `{ timeline, skillsToLearn, potentialRoles }`. This panel previously
 * rendered only `timeline` and silently discarded the other two, while passing milestones
 * to a component that required a per-milestone `skills` array the API never sends —
 * which crashed the page.
 */
const CareerPathPanel: React.FC<{ offerId: string }> = ({ offerId }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["career-path", offerId],
    queryFn: () => api.get(ENDPOINTS.OFFER_CAREER_PATH(offerId)).then((r) => r.data.data),
    // A daily-limit 429 will not clear on retry; anything else gets the usual three.
    retry: (count, err) => !getQuotaError(err) && count < 3,
  });

  if (isLoading) return <LoadingState rows={3} />;
  if (error) {
    const quotaError = getQuotaError(error);
    // No retry button for a used-up daily limit: retrying cannot succeed before the reset.
    if (quotaError) return <ErrorState message={quotaExhaustedText(quotaError)} />;
    return <ErrorState onRetry={() => refetch()} />;
  }

  // `milestones` kept as a fallback in case the endpoint is ever renamed.
  const milestones = Array.isArray(data?.milestones)
    ? data.milestones
    : Array.isArray(data?.timeline)
      ? data.timeline
      : [];

  const skillsToLearn: string[] = Array.isArray(data?.skillsToLearn) ? data.skillsToLearn : [];
  const potentialRoles: string[] = Array.isArray(data?.potentialRoles) ? data.potentialRoles : [];

  // The provider returns this shape with an `error` key when generation fails, rather
  // than throwing — so an empty result is not necessarily a request failure.
  if (data?.error && milestones.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        We couldn&apos;t generate a career path for this offer. Please try again.
      </p>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      <CareerTimeline milestones={milestones} />

      {skillsToLearn.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Skills to build</h4>
          <div className="flex flex-wrap gap-1.5">
            {skillsToLearn.map((s) => (
              <span key={s} className="rounded-full bg-accent px-3 py-1 text-xs skeu-emboss">{s}</span>
            ))}
          </div>
        </section>
      )}

      {potentialRoles.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Roles this could lead to</h4>
          <ul className="space-y-1">
            {potentialRoles.map((r) => (
              <li key={r} className="text-sm text-muted-foreground">• {r}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default CareerPathPanel;
