"use client";

import { useQuery } from "@tanstack/react-query";
import { getAccessibleRepositories } from "@/module/team/actions";
import { indexInProgress } from "@/module/repository/lib/index-status";

export const ACCESSIBLE_REPOSITORIES_QUERY_KEY = ["accessible-repositories", "VIEWER"] as const;

export function useAccessibleRepositories() {
  return useQuery({
    queryKey: ACCESSIBLE_REPOSITORIES_QUERY_KEY,
    queryFn: () => getAccessibleRepositories("VIEWER"),
    staleTime: 60_000,
    refetchInterval: (query) =>
      query.state.data?.some((repository) => indexInProgress(repository.indexStatus)) ? 5_000 : false,
  });
}
