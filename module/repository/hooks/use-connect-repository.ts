"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { connectRepository } from "../actions";
import { toast } from "sonner";

export const useConnectRepository = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      owner,
      repo,
      githubId,
    }: {
      owner: string;
      repo: string;
      githubId: number;
    }) => {
      return await connectRepository(owner, repo, githubId);
    },
    onSuccess: () => {
      toast.success("Repository connected successfully");
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
    },
    onError: (error) => {
      console.error("Failed to connect repository", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to connect repository"
      );
    },
  });
};
