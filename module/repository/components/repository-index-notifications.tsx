"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { indexInProgress, type RepositoryIndexState } from "@/module/repository/lib/index-status";
import { useAccessibleRepositories } from "@/module/team/hooks/use-accessible-repositories";

const RECENT_COMPLETION_MS = 5 * 60 * 1000;

export default function RepositoryIndexNotifications() {
  const { data: repositories } = useAccessibleRepositories();
  const notifiedJobs = useRef(new Set<string>());
  const previousStatuses = useRef(new Map<string, { jobId: string | null; status: RepositoryIndexState | null }>());

  useEffect(() => {
    for (const repository of repositories ?? []) {
      const { indexJobId, indexStatus, indexUpdatedAt } = repository;
      const previous = previousStatuses.current.get(repository.id);
      const transitionedFromActive =
        previous?.jobId === indexJobId && indexInProgress(previous.status);
      previousStatuses.current.set(repository.id, { jobId: indexJobId, status: indexStatus });

      if (!indexJobId || !indexUpdatedAt || !["ready", "empty", "failed"].includes(indexStatus ?? "")) continue;

      const notificationKey = `${repository.id}:${indexJobId}:${indexStatus}`;
      if (notifiedJobs.current.has(notificationKey)) continue;
      notifiedJobs.current.add(notificationKey);

      const updatedAt = Date.parse(indexUpdatedAt);
      const recentlyUpdated = Number.isFinite(updatedAt) && Date.now() - updatedAt <= RECENT_COMPLETION_MS;
      if (!transitionedFromActive && !recentlyUpdated) continue;

      if (indexStatus === "ready") {
        toast.success(`Indexing complete for ${repository.fullName}. You can ask questions now.`);
      } else if (indexStatus === "empty") {
        toast.info(`Indexing finished for ${repository.fullName}, but no indexable files were found.`);
      } else {
        toast.error(`Indexing failed for ${repository.fullName}. Re-index the repository to try again.`);
      }
    }
  }, [repositories]);

  return null;
}
