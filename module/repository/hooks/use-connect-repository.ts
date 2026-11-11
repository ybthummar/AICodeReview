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

      if (result.data.webhook === "failed") {
        toast.warning(
          "Repository connected, but the GitHub webhook could not be registered. Reviews will only run when you start them from the dashboard."
        );
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
