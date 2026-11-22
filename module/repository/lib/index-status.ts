export const INDEX_STALL_MS = 30 * 60 * 1000;
export const ACTIVE_INDEX_STATUSES = ["queued", "indexing"];

export type RepositoryIndexState = "queued" | "indexing" | "ready" | "empty" | "failed";

export function repositoryIndexStatus(
  status: string | null,
  updatedAt: Date | null
): RepositoryIndexState | null {
  if (status === "queued" || status === "indexing") {
    if (!updatedAt || Date.now() - updatedAt.getTime() >= INDEX_STALL_MS) return "failed";
    return status;
  }
  if (status === "ready" || status === "empty" || status === "failed") return status;
  return null;
}

export type RepositoryIndexStatus = {
  repositoryId: string;
  fullName: string;
  owned: boolean;
  jobId: string | null;
  status: ReturnType<typeof repositoryIndexStatus>;
  filesDone: number;
  filesTotal: number | null;
  updatedAt: string | null;
  canAsk: boolean;
};

export function indexInProgress(status: RepositoryIndexStatus["status"]) {
  return status === "queued" || status === "indexing";
}
