import prisma from "@/lib/db";
import { normalizeReviewConfig, type ReviewConfig } from "@/module/review-rules/lib/config";

export async function loadReviewConfig(repositoryId: string): Promise<ReviewConfig> {
  const settings = await prisma.repositorySettings.findUnique({
    where: { repositoryId },
    select: { config: true },
  });

  return normalizeReviewConfig(settings?.config);
}
