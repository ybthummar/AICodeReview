/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { inngest } from "../client";
import prisma from "@/lib/db";

export const scheduleRepoSummaries = inngest.createFunction(
  {
    id: "schedule-repo-summaries",
    retries: 1,
  },
  { cron: "TZ=America/New_York 0 10 * * 1" },
  async ({ step, logger }) => {
    const DEFAULT_CC = "hello@repopilot.team";

    logger.info("Starting weekly repository summaries schedule...");
    
    // Fetch all repositories with their clients
    const repositories = await step.run("fetch-all-repositories", async () => {
      return prisma.repository.findMany({
        select: {
          id: true,
          name: true,
          userId: true,
          user: {
            select: {
              email: true
            }
          },
          _count: {
            select: {
              repositoryClients: true
            }
          }
        },
        where: {
          repositoryClients: {
            some: {} 
          }
        }
      });
    });

    logger.info(`Found ${repositories.length} repositories with clients`);

    if (repositories.length === 0) {
      logger.info("No repositories with clients found");
      return { message: "No repositories with clients to process" };
    }

    const events = repositories.map(repo => ({
      name: "repo.weekly.summary" as const,
      data: {
        repositoryId: repo.id,
        triggeredBy: "cron",
        managerEmail: repo.user?.email || DEFAULT_CC,
      },
      user: {
        id: repo.userId,
        email: repo.user?.email
      }
    }));

    const batchSize = 50;
    const batches = [];
    
    for (let i = 0; i < events.length; i += batchSize) {
      batches.push(events.slice(i, i + batchSize));
    }

    const results = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResult = await step.run(`send-batch-${i}`, async () => {
        try {
          await inngest.send(batch);
          return {
            batch: i + 1,
            success: true,
            count: batch.length
          };
        } catch (error) {
          logger.error(`Failed to send batch ${i + 1}:`, error);
          return {
            batch: i + 1,
            success: false,
            error: String(error),
            count: batch.length
          };
        }
      });
      
      results.push(batchResult);
    }

    const successfulBatches = results.filter(r => r.success).length;
    const totalEvents = results.reduce((sum, r) => sum + (r.count || 0), 0);

    logger.info(`Scheduled ${totalEvents} repository summary events across ${batches.length} batches`);

    return {
      scheduledAt: new Date().toISOString(),
      totalRepositories: repositories.length,
      totalEventsScheduled: totalEvents,
      batches: batches.length,
      successfulBatches,
      failedBatches: batches.length - successfulBatches,
      results
    };
  }
);
