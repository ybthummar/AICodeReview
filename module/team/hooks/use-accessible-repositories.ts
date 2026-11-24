"use client";

import { useQuery } from "@tanstack/react-query";
import { loadAccessibleRepositories } from "@/module/team/actions";
import { indexInProgress } from "@/module/repository/lib/index-status";

export const ACCESSIBLE_REPOSITORIES_QUERY_KEY = ["accessible-repositories", "VIEWER"] as const;

export function useAccessibleRepositories() {
  return useQuery({
    queryKey: ACCESSIBLE_REPOSITORIES_QUERY_KEY,
    queryFn: async () => {
      const result = await loadAccessibleRepositories().catch(() => {
        throw new Error("Could not contact the app to load repositories. Check your connection and retry.");
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
    refetchInterval: (query) =>
      query.state.data?.some((repository) => indexInProgress(repository.indexStatus)) ? 5_000 : false,
  });
}
