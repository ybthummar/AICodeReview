/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import {
  fetchUserContribution,
  getGitHubToken,
} from "@/module/github/lib/github";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Octokit } from "octokit";
import prisma from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import { daysUntil, isProActive } from "@/lib/subscription";

export async function getUserContributionStats() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("No session found");
    }

    const token = await getGitHubToken();
    const octokit = new Octokit({
      auth: token,
    });

    const { data: user } = await octokit.rest.users.getAuthenticated();
    const calendar = await fetchUserContribution(token, user?.login);

    if (!calendar) {
      return null;
    } 

    const contributions = calendar.weeks.flatMap((week: any) =>
      week.contributionDays.map((day: any) => ({
        date: day.date,
        count: day.contributionCount,
        level: Math.min(4, Math.floor(day.contributionCount / 3)),
      }))
    );

    return { contributions, totalContributions: calendar.totalContributions };
  } catch (error) {
    console.error("Error fetching user contribution stats:", error);
    return null;
  }
}

export async function getSubscriptionStatus(): Promise<{
  tier: "FREE" | "PRO" | "ADMIN";
  isPro: boolean;
  endsAt: string | null;
  daysLeft: number | null;
}> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { tier: "FREE", isPro: false, endsAt: null, daysLeft: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
    },
  });

  if (isAdminUser(user)) {
    return { tier: "ADMIN", isPro: true, endsAt: null, daysLeft: null };
  }

  const isPro = isProActive(user);

  return {
    tier: isPro ? "PRO" : "FREE",
    isPro,
    endsAt: isPro && user?.subscriptionEndsAt ? user.subscriptionEndsAt.toISOString() : null,
    daysLeft: isPro ? daysUntil(user?.subscriptionEndsAt) : null,
  };
}

export async function getDashboardStats() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("No session found");
    }

    // Database-backed numbers never depend on GitHub being reachable
    const [totalRepos, totalReviews] = await Promise.all([
      prisma.repository.count({ where: { userId: session.user.id } }),
      prisma.review.count({
        where: { repository: { userId: session.user.id } },
      }),
    ]);

    let totalCommits = 0;
    let totalPRs = 0;

    try {
      const token = await getGitHubToken();
      const octokit = new Octokit({
        auth: token,
      });

      const { data: user } = await octokit.rest.users.getAuthenticated();

      const [calendar, prs] = await Promise.all([
        fetchUserContribution(token, user.login),
        octokit.rest.search.issuesAndPullRequests({
          q: `author:${user.login} type:pr`,
          per_page: 1,
        }),
      ]);

      totalCommits = calendar?.totalContributions || 0;
      totalPRs = prs.data.total_count || 0;
    } catch (githubError) {
      console.error("GitHub stats unavailable for dashboard:", githubError);
    }

    return { totalCommits, totalPRs, totalReviews, totalRepos };
  } catch (error) {
    console.error("Error fetching dashboard status:", error);
    return {
      totalCommits: 0,
      totalPRs: 0,
      totalReviews: 0,
      totalRepos: 0,
    };
  }
}

export async function getMonthlyActivity() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("No session found");
    }

    const token = await getGitHubToken();
    const octokit = new Octokit({
      auth: token,
    });

    const { data: user } = await octokit.rest.users.getAuthenticated();

    const calendar = await fetchUserContribution(token, user.login);

    if (!calendar) {
      return [];
    }

    const monthlyData: {
      [key: string]: { commits: number; prs: number; reviews: number };
    } = {};

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    // Keyed by year-month so the same month from last year is never merged in
    const toKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;

    const now = new Date();
    const orderedKeys: { key: string; month: string }[] = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = toKey(date);
      monthlyData[key] = { commits: 0, prs: 0, reviews: 0 };
      orderedKeys.push({ key, month: monthNames[date.getMonth()] });
    }

    calendar.weeks.forEach((week: any) => {
      week.contributionDays.forEach((day: any) => {
        const [year, month] = day.date.split("-").map(Number);
        const key = `${year}-${month - 1}`;
        if (monthlyData[key]) {
          monthlyData[key].commits += day.contributionCount;
        }
      });
    });

    const sixMonthAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Fetch REAL reviews from the database instead of fake sample data
    const reviews = await prisma.review.findMany({
      where: {
        repository: {
          userId: session.user.id,
        },
        createdAt: {
          gte: sixMonthAgo,
        },
      },
      select: {
        createdAt: true,
      },
    });

    reviews.forEach((review) => {
      const key = toKey(review.createdAt);
      if (monthlyData[key]) {
        monthlyData[key].reviews += 1;
      }
    });

    const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
      q: `author:${user.login} type:pr created:>=${
        sixMonthAgo.toISOString().split("T")[0]
      }`,
      per_page: 100,
    });

    prs.items.forEach((pr) => {
      const key = toKey(new Date(pr.created_at));
      if (monthlyData[key]) {
        monthlyData[key].prs += 1;
      }
    });

    return orderedKeys.map(({ key, month }) => ({
      month,
      ...monthlyData[key],
    }));
  } catch (error) {
    console.error("Error fetching monthly activity:", error);
    return [];
  }
}
