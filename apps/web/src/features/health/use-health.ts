import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '@/services/health';

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: 1,
    refetchInterval: 30_000,
  });
}
