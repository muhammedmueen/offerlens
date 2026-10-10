import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuth } from "@/store/auth";
import type { QuotaSnapshot } from "@/lib/quota";

/**
 * Today's quota for the caller (GET /quota). Keyed by user so signing in or out refetches.
 * Invalidate `["quota"]` after anything that spends a unit.
 */
export function useQuota() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["quota", user?.id ?? "guest"],
    queryFn: () => api.get(ENDPOINTS.QUOTA).then((r) => r.data.data as QuotaSnapshot),
  });
}
