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

      const notices: string[] = [
        result.data.indexingQueued
          ? "indexing has started and you'll be notified when it is ready"
          : "indexing could not be queued; use Re-index from the codebase chat",
      ];
      if (result.data.webhook === "failed") {
        notices.push("the GitHub webhook could not be registered");
      }

      if (result.data.webhook === "failed" || !result.data.indexingQueued) {
        toast.warning(`Repository connected; ${notices.join(". ")}.`);
      } else {
        toast.success(`Repository connected; ${notices[0]}.`);
      }

      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      queryClient.invalidateQueries({ queryKey: ["connected-repositories"] });
      queryClient.invalidateQueries({ queryKey: ["connected-repos-prs"] });
      queryClient.invalidateQueries({ queryKey: ["accessible-repositories"] });
    },
    onError: (error) => {
      console.error("Failed to connect repository", error);
      toast.error("Failed to connect repository");
    },
  });
};
