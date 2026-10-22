"use server";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdminUser } from "@/lib/admin";
import { revalidatePath } from "next/cache";

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
  await requireAdminSession();

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionStatus: status,
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/subscriptions");
  revalidatePath("/dashboard");

  return { success: true, user: updatedUser };
}
