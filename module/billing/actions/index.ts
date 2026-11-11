"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUsageSnapshot, type UsageSnapshot } from "@/module/billing/lib/usage";

export async function getUsageSummary(): Promise<UsageSnapshot | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) return null;

  try {
    return await getUsageSnapshot(session.user.id);
  } catch (error) {
    console.error("Failed to load usage summary:", error);
    return null;
  }
}
