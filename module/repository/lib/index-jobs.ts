import { randomUUID } from "node:crypto";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { ACTIVE_INDEX_STATUSES, INDEX_STALL_MS } from "./index-status";

export async function queueRepositoryIndex(repository: {
  id: string;
  owner: string;
  name: string;
  userId: string;
}): Promise<boolean> {
  const jobId = randomUUID();
  const now = new Date();
  const queued = await prisma.repository.updateMany({
    where: {
      id: repository.id,
      userId: repository.userId,
      OR: [
        { indexStatus: null },
        { indexStatus: { notIn: ACTIVE_INDEX_STATUSES } },
        { indexStatus: { in: ACTIVE_INDEX_STATUSES }, indexUpdatedAt: null },
        { indexUpdatedAt: { lte: new Date(now.getTime() - INDEX_STALL_MS) } },
      ],
    },
    data: {
      indexJobId: jobId,
      indexStatus: "queued",
      indexUpdatedAt: now,
      indexFilesDone: 0,
      indexFilesTotal: null,
    },
  });
  if (!queued.count) {
    const current = await prisma.repository.findUnique({
      where: { id: repository.id },
      select: { indexStatus: true, indexUpdatedAt: true },
    });
    return Boolean(
      current &&
      current.indexStatus &&
      ACTIVE_INDEX_STATUSES.includes(current.indexStatus) &&
      current.indexUpdatedAt &&
      now.getTime() - current.indexUpdatedAt.getTime() < INDEX_STALL_MS
    );
  }

  try {
    await inngest.send({
      id: jobId,
      name: "repository.connected",
      data: { repositoryId: repository.id, jobId, owner: repository.owner, repo: repository.name, userId: repository.userId },
    });
  } catch (error) {
    await prisma.repository.updateMany({
      where: { id: repository.id, indexJobId: jobId, indexStatus: "queued" },
      data: { indexStatus: "failed", indexUpdatedAt: new Date() },
    });
    throw error;
  }

  return true;
}
