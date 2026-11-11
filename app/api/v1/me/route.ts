import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import { isProActive } from "@/lib/subscription";
import { getUsageSnapshot } from "@/module/billing/lib/usage";
import { authenticateApiKey } from "@/module/api-keys/lib/keys";

export async function GET(request: Request) {
  const identity = await authenticateApiKey(request);
  if (!identity) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: identity.userId },
    select: {
      name: true,
      email: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const usage = await getUsageSnapshot(identity.userId);

  return NextResponse.json({
    name: user.name,
    email: user.email,
    plan: isAdminUser(user) ? "ADMIN" : isProActive(user) ? "PRO" : "FREE",
    usage: usage.items.map((item) => ({ kind: item.kind, used: item.used, limit: item.limit })),
    resetsAt: usage.resetsAt,
  });
}
