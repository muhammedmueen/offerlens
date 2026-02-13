import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import CareerTimeline from "@/components/charts/CareerTimeline";

const CareerPathPanel: React.FC<{ offerId: string }> = ({ offerId }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["career-path", offerId],
    queryFn: () => api.get(ENDPOINTS.OFFER_CAREER_PATH(offerId)).then((r) => r.data.data),
  });

  if (isLoading) return <LoadingState rows={3} />;
  if (error) return <ErrorState onRetry={() => refetch()} />;

  const milestones = data?.milestones || data?.timeline || [];

  return (
    <div className="pt-4">
      {data?.note && <p className="text-xs text-muted-foreground italic mb-4">{data.note}</p>}
      <CareerTimeline milestones={milestones} />
    </div>
  );
};

export default CareerPathPanel;
