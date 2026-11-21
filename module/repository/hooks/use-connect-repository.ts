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
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const warnings: string[] = [];
      if (result.data.webhook === "failed") {
        warnings.push("the GitHub webhook could not be registered");
      }
      if (!result.data.indexingQueued) {
        warnings.push("indexing could not be queued; use Re-index from the codebase chat");
      }

      if (warnings.length > 0) {
        toast.warning(`Repository connected, but ${warnings.join(" and ")}.`);
      } else {
        toast.success("Repository connected successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      queryClient.invalidateQueries({ queryKey: ["connected-repositories"] });
      queryClient.invalidateQueries({ queryKey: ["accessible-repositories"] });
    },
    onError: (error) => {
      console.error("Failed to connect repository", error);
      toast.error("Failed to connect repository");
    },
  });
};
