import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createUserApi, deleteUserApi, listUsersApi, updateUserApi } from './api';
import { queryKeys } from '../../lib/query-keys';
import type { UserRole } from './types';

export function useUsersQuery(companyId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && companyId.length > 0,
    queryFn: () => listUsersApi(companyId),
    queryKey: queryKeys.users(companyId),
    staleTime: 30_000,
  });
}

export function useUserMutations(companyId: string, userId: string) {
  const queryClient = useQueryClient();

  const invalidateUsers = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users(companyId) });
  };

  const createUser = useMutation({
    mutationFn: createUserApi,
    onSuccess: invalidateUsers,
  });

  const updateUser = useMutation({
    mutationFn: (payload: {
      branchId: string;
      fullName: string;
      isActive: boolean;
      password: string;
      pin: string;
      role: UserRole;
      username: string;
    }) => updateUserApi(userId, payload),
    onSuccess: invalidateUsers,
  });

  const deleteUser = useMutation({
    mutationFn: () => deleteUserApi(userId),
    onSuccess: invalidateUsers,
  });

  return { createUser, deleteUser, updateUser };
}
