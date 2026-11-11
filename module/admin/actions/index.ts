"use server";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdminUser } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/module/audit/lib/audit";

async function requireAdminSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized: You must be logged in.");
  }

  if (!isAdminUser(session.user)) {
    throw new Error("Forbidden: Admin access required.");
  }

  return session;
}

export async function checkIsCurrentUserAdmin() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) return false;
    return isAdminUser(session.user);
  } catch {
    return false;
  }
}

export async function getAdminDashboardData() {
  await requireAdminSession();

  const [totalUsers, totalRepos, totalReviews, proUsers, users, recentReviews] =
    await Promise.all([
      prisma.user.count(),
      prisma.repository.count(),
      prisma.review.count(),
      prisma.user.count({
        where: {
          subscriptionTier: "PRO",
          subscriptionStatus: "ACTIVE",
          OR: [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { gt: new Date() } }],
        },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionEndsAt: true,
          createdAt: true,
          _count: {
            select: {
              repositories: true,
            },
          },
        },
      }),
      prisma.review.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          repository: {
            select: {
              name: true,
              fullName: true,
              owner: true,
            },
          },
        },
      }),
    ]);

  return {
    kpis: {
      totalUsers,
      totalRepos,
      totalReviews,
      proUsers,
    },
    users: users.map((u) => ({
      ...u,
      isAdmin: isAdminUser(u),
    })),
    recentReviews,
  };
}

export async function adminUpdateUserSubscription(
  userId: string,
  tier: "FREE" | "PRO" | "ADMIN",
  status: "ACTIVE" | "INACTIVE" | "CANCELLED"
) {
  const session = await requireAdminSession();

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionStatus: status,
      // Admin grants never expire on their own.
      subscriptionEndsAt: null,
    },
  });

  await recordAudit({
    userId: session.user.id,
    action: "subscription.changed_by_admin",
    targetType: "user",
    targetId: userId,
    summary: `Set ${updatedUser.email} to ${tier} (${status})`,
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/subscriptions");
  revalidatePath("/dashboard");

  return {
    success: true,
    user: {
      id: updatedUser.id,
      subscriptionTier: updatedUser.subscriptionTier,
      subscriptionStatus: updatedUser.subscriptionStatus,
    },
  };
}
