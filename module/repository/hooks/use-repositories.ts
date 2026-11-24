"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { RepositoryFetchErrorCode } from "@/types/repository/types";
import { fetchRepositories } from "../actions";

export class RepositoryFetchError extends Error {
  constructor(readonly code: RepositoryFetchErrorCode, message: string) {
    super(message);
  }
}

export function useRepositories(search: string) {
  return useInfiniteQuery({
    queryKey: ["repositories", search],
    queryFn: async ({ pageParam }) => {
      const result = await fetchRepositories(pageParam, 10, search);
      if (!result.ok) throw new RepositoryFetchError(result.code, result.message);
      return result;
    },
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.hasNextPage ? lastPageParam + 1 : undefined,
    initialPageParam: 1,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
