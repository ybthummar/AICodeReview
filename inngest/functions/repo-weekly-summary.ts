/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { inngest } from "../client";
import prisma from "@/lib/db";
import { generateRepoSummary } from "@/module/repo-client/lib/summary";
import { sendMail, wrapEmailTemplate } from "@/lib/mail";

function getWeekKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const week = Math.ceil(
    ((+date - +new Date(Date.UTC(year, 0, 1))) / 86400000 + 1) / 7
  );
  return `${year}-W${week}`;
}

export const repoWeeklySummary = inngest.createFunction(
  {
    id: "repo-weekly-summary",
    retries: 3,
  },
  { event: "repo.weekly.summary" },
  async ({ event, step }) => {
    const { repositoryId, triggeredBy, managerEmail } = event.data;
    const weekKey = getWeekKey();

    // Fetch repository 
    const repo = await step.run("fetch-repository", async () => {
      return prisma.repository.findUnique({
        where: { id: repositoryId },
        include: {
          repositoryClients: {
            include: {
              client: true,
            },
          },
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          user: true, 
        },
      });
    });

    if (!repo) {
      console.log(`Repository ${repositoryId} not found`);
      return { skipped: true, reason: "repository_not_found" };
    }

    if (repo.repositoryClients.length === 0) {
      console.log(`No clients mapped to repository ${repositoryId}`);
      return { skipped: true, reason: "no_clients" };
    }

    const aiSummary = await step.run("generate-ai-summary", async () => {
      return generateRepoSummary(repo);
    });

    if (!aiSummary) {
      console.error(
        `Failed to generate summary for repository ${repositoryId}`
      );
      return { error: true, reason: "summary_generation_failed" };
    }

    const emailHtml = wrapEmailTemplate(aiSummary.html, repo.name);

    let sent = 0;
    const skipped = [];
    const errors = [];

    const ccEmail = managerEmail || repo.user?.email;

    // Send emails to all clients
    for (const rc of repo.repositoryClients) {
      const shouldSkip =
        triggeredBy === "cron" &&
        rc.deliveredAt &&
        getWeekKey(rc.deliveredAt) === weekKey;

      if (shouldSkip) {
        console.log(
          `Skipping ${rc.client.email} - already delivered this week`
        );
        skipped.push(rc.client.email);
        continue;
      }

      const emailResult = await step.run(`email-${rc.client.id}`, async () => {
        try {
          const emailOptions = {
            to: rc.client.email,
            subject: `Weekly Update - ${repo.name}`,
            html: emailHtml,
            cc: managerEmail
          };

          await sendMail(emailOptions);
          return { success: true };
        } catch (error) {
          console.error(`Failed to send email to ${rc.client.email}:`, error);
          return { success: false, error: String(error) };
        }
      });

      if (!emailResult.success) {
        errors.push({ email: rc.client.email, error: emailResult.error });
        continue;
      }

      await step.run(`mark-delivered-${rc.client.id}`, async () => {
        await prisma.repositoryClient.update({
          where: { id: rc.id },
          data: { deliveredAt: new Date() },
        });
      });

      sent++;
    }

    return {
      success: true,
      repositoryId,
      repositoryName: repo.name,
      triggeredBy,
      totalClients: repo.repositoryClients.length,
      sentTo: sent,
      skipped: skipped.length,
      skippedEmails: skipped,
      errors: errors.length,
      errorDetails: errors,
      managerCc: ccEmail || "not_available",
    };
  }
);