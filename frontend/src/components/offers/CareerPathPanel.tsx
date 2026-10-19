import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import CareerTimeline from "@/components/charts/CareerTimeline";
import CareerProgression from "@/components/offers/CareerProgression";
import { getQuotaError, quotaExhaustedText, isRateLimited, RATE_LIMITED_TEXT } from "@/lib/quota";

/**
 * CAR-1: a permanent client error cannot succeed on retry, so retrying one is wasted time.
 * True for any 4xx EXCEPT 429 — a 429 is handled by the quota convention below (a daily-limit
 * 429 already fails via getQuotaError; a plain rate-limit 429 may clear, so it keeps retrying,
 * matching BenefitsPanel). A missing `response` means network/offline, which is transient.
 * ponytail: treats every non-429 4xx as permanent (correct for 400/404 here); if the career
 * endpoint ever returns a retryable 4xx, narrow this to the specific status codes.
 */
const isPermanentError = (err: unknown): boolean => {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status !== undefined && status >= 400 && status < 500 && status !== 429;
};

/** CAR-1: the backend's 400 when the analysis has no role (career.service.ts, INVALID_INPUT). */
const isRoleNotIdentified = (err: unknown): boolean =>
  (err as { response?: { status?: number; data?: { error?: { code?: string } } } })?.response?.status === 400 &&
  (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code === "INVALID_INPUT";

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
    // CAR-1: a permanent client error (e.g. a 400 'role not identified') cannot succeed on
    // retry, so it fails immediately. A daily-limit 429 likewise won't clear before reset.
    // Everything else (network / 5xx / rate-limit 429) still gets the usual three.
    retry: (count, err) => !isPermanentError(err) && !getQuotaError(err) && count < 3,
  });

  if (isLoading) return <LoadingState rows={3} />;
  if (error) {
    const quotaError = getQuotaError(error);
    // No retry button for a used-up daily limit: retrying cannot succeed before the reset.
    if (quotaError) return <ErrorState message={quotaExhaustedText(quotaError)} />;
    if (isRateLimited(error)) return <ErrorState message={RATE_LIMITED_TEXT} onRetry={() => refetch()} />;
    // CAR-1: the offer has no identifiable role — a meaningful message, and NO retry button,
    // because refetching would just hit the same permanent 400.
    if (isRoleNotIdentified(error))
      return (
        <ErrorState message="We couldn't map a career path because this offer doesn't name an identifiable role. Try an offer that states the job title." />
      );
    // Any other permanent client error: real message, still no dead retry button.
    if (isPermanentError(error)) return <ErrorState />;
    // Transient (network / 5xx): keep the retry affordance — a refetch can plausibly succeed.
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
  // The pay table is deterministic and does not need the model, so it still renders here.
  if (data?.error && milestones.length === 0) {
    return (
      <div className="space-y-6 pt-4">
        <CareerProgression progression={data?.progression} />
        <p className="py-8 text-center text-sm text-muted-foreground">
          We couldn&apos;t generate a career path for this offer. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      <CareerProgression progression={data?.progression} />
      <CareerTimeline milestones={milestones} />

      {skillsToLearn.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Skills to build</h4>
          <div className="flex flex-wrap gap-1.5">
            {skillsToLearn.map((s) => (
              <span key={s} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700">{s}</span>
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
