import { APICallError } from "ai";
import { RetryAfterError } from "inngest";
import { inngest } from "../client";
import prisma from "@/lib/db";
import {
  indexCodebaseBatch,
  purgeRepositoryIndex,
  repositoryIndexIsVisible,
  repositoryIndexKey,
} from "@/module/ai/lib/rag";
import { getRepositoryIndexFiles, getRepositoryIndexFileContents } from "@/module/github/lib/github";
import { ACTIVE_INDEX_STATUSES } from "@/module/repository/lib/index-status";
import { requireRepositoryToken } from "@/module/team/lib/access";

const FILES_PER_STEP = 20;

type RepositoryIndexEvent = {
  repositoryId?: string;
  jobId?: string;
  owner: string;
  repo: string;
  userId: string;
};

function repositoryWhere(data: RepositoryIndexEvent) {
  return {
    userId: data.userId,
    ...(data.repositoryId
      ? { id: data.repositoryId }
      : { owner: { equals: data.owner, mode: "insensitive" as const }, name: { equals: data.repo, mode: "insensitive" as const } }),
  };
}

export const indexRepo = inngest.createFunction(
  {
    id: "index-repo",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.owner + '/' + event.data.repo" },
    onFailure: async ({ event }) => {
      const data: RepositoryIndexEvent = event.data.event.data;
      const jobId = data.jobId ?? event.data.run_id;
      const repository = await prisma.repository.findFirst({
        where: repositoryWhere(data),
        select: { id: true, fullName: true, indexRevision: true },
      });
      if (!repository || repository.indexRevision === jobId) return;

      await prisma.repository.updateMany({
        where: { id: repository.id, indexJobId: jobId, indexStatus: { in: ACTIVE_INDEX_STATUSES } },
        data: { indexStatus: "failed", indexUpdatedAt: new Date() },
      });
      await purgeRepositoryIndex(repository.fullName, jobId);
    },
  },
  { event: "repository.connected" },
  async ({ event, runId, step }) => {
    const data: RepositoryIndexEvent = event.data;
    const jobId = data.jobId ?? runId;
    const repository = await step.run("start-indexing", async () => {
      const current = await prisma.repository.findFirst({
        where: repositoryWhere(data),
        select: { id: true, userId: true, owner: true, name: true, fullName: true, indexRevision: true },
      });
      if (!current) return null;

      // Events queued before progress tracking can still run unless a newer job has claimed the repository.
      const started = await prisma.repository.updateMany({
        where: {
          id: current.id,
          OR: [
            { indexJobId: jobId, indexStatus: { in: ACTIVE_INDEX_STATUSES } },
            ...(!data.jobId ? [{ indexJobId: null }] : []),
          ],
        },
        data: { indexJobId: jobId, indexStatus: "indexing", indexUpdatedAt: new Date() },
      });

      return started.count ? current : null;
    });
    if (!repository) return { skipped: true };

    const activeJob = { id: repository.id, indexJobId: jobId, indexStatus: "indexing" };
    const indexKey = repositoryIndexKey(repository.fullName, jobId);
    const files = await step.run("list-source-files", async () => {
      const token = await requireRepositoryToken(repository.userId, repository.owner, repository.name);
      const files = await getRepositoryIndexFiles(token, repository.owner, repository.name);
      await prisma.repository.updateMany({
        where: activeJob,
        data: { indexFilesTotal: files.length, indexUpdatedAt: new Date() },
      });
      return files;
    });

    let vectors = 0;
    for (let offset = 0; offset < files.length; offset += FILES_PER_STEP) {
      const batch = files.slice(offset, offset + FILES_PER_STEP);
      const result = await step.run(`index-files-${offset}`, async () => {
        if (!await prisma.repository.findFirst({ where: activeJob, select: { id: true } })) return null;

        const started = performance.now();
        const token = await requireRepositoryToken(repository.userId, repository.owner, repository.name);
        const contents = await getRepositoryIndexFileContents(token, repository.owner, repository.name, batch);
        const fetched = performance.now();
        const { indexed } = await indexCodebaseBatch(indexKey, contents).catch((error: unknown) => {
          if (APICallError.isInstance(error) && error.statusCode === 429) {
            throw new RetryAfterError("The embedding provider rate-limited this batch.", "60s", { cause: error });
          }
          throw error;
        });
        const updated = await prisma.repository.updateMany({
          where: activeJob,
          data: { indexFilesDone: offset + batch.length, indexUpdatedAt: new Date() },
        });

        console.info("[repository-index]", {
          repositoryId: repository.id, files: batch.length, vectors: indexed,
          downloadMs: Math.round(fetched - started), indexMs: Math.round(performance.now() - fetched),
        });
        if (updated.count) return indexed;

        await purgeRepositoryIndex(repository.fullName, jobId);
        return null;
      });
      if (result === null) return { skipped: true };
      vectors += result;
    }

    const published = await step.run("publish-index", async () => {
      // A run can be retried after the database commit succeeded.
      const current = await prisma.repository.findUnique({
        where: { id: repository.id },
        select: { indexJobId: true, indexRevision: true, indexStatus: true },
      });
      if (current?.indexRevision === jobId) return true;
      if (current?.indexJobId !== jobId || current.indexStatus !== "indexing") return false;
      if (vectors && !await repositoryIndexIsVisible(indexKey, vectors)) {
        throw new RetryAfterError("Waiting for the index to become searchable.", "8s");
      }

      const result = await prisma.repository.updateMany({
        where: activeJob,
        data: {
          indexRevision: jobId,
          indexVectorCount: vectors,
          indexStatus: vectors ? "ready" : "empty",
          indexUpdatedAt: new Date(),
        },
      });
      return Boolean(result.count);
    });

    await step.run("clean-up-index", async () => {
      await purgeRepositoryIndex(repository.fullName, published ? repository.indexRevision : jobId);
    });

    return { success: published, filesProcessed: files.length, vectors };
  }
);
