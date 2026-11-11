import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { indexRepo } from "@/inngest/functions";
import { generateReview } from "@/inngest/functions/review";
import { scheduleRepoSummaries } from "@/inngest/functions/weekly-cron-function";
import { repoWeeklySummary } from "@/inngest/functions/repo-weekly-summary";
import { subscriptionMaintenance } from "@/inngest/functions/subscription-cron";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    indexRepo,
    generateReview,
    scheduleRepoSummaries,
    repoWeeklySummary,
    subscriptionMaintenance,
  ],
});
