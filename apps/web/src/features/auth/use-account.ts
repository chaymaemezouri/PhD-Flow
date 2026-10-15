import { currentUserSchema } from '@scholarflow/validation';
import type { CurrentUser } from '@scholarflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage, apiFetch, clearCsrf } from '@/services/api';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['account'],
    queryFn: fetchCurrentUser,
    retry: false,
  });
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await apiFetch('/api/v1/auth/me');
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return currentUserSchema.parse(await response.json());
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiFetch('/api/v1/auth/logout', { method: 'POST' });
      if (!response.ok && response.status !== 204) {
        throw new Error(await apiErrorMessage(response));
      }
    },
    onSuccess: () => {
      clearCsrf();
      queryClient.clear();
    },
  });
}
