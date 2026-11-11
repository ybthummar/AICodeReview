"use server";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { inngest } from "@/inngest/client";
import { generateRepoSummary } from "@/module/repo-client/lib/summary";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session;
}

async function requireOwnedRepository(repositoryId: string, userId: string) {
  const repository = await prisma.repository.findFirst({
    where: { id: repositoryId, userId },
    select: { id: true },
  });

  if (!repository) {
    throw new Error("Repository not found or access denied.");
  }
}

export async function addClient(name: string, email: string) {
  await requireSession();

  const cleanName = name?.trim();
  const cleanEmail = email?.trim().toLowerCase();

  if (!cleanName || !cleanEmail) {
    throw new Error("Name and email are required");
  }

  if (!EMAIL_PATTERN.test(cleanEmail)) {
    throw new Error("Please enter a valid email address");
  }

  const existing = await prisma.client.findFirst({
    where: { email: { equals: cleanEmail, mode: "insensitive" } },
  });

  if (existing) {
    return existing;
  }

  return prisma.client.create({
    data: {
      name: cleanName,
      email: cleanEmail,
    },
  });
}

export async function addRepoClient(repoId: string, clientId: string) {
  const session = await requireSession();

  if (!repoId || !clientId) {
    throw new Error("repoId and clientId are required");
  }

  await requireOwnedRepository(repoId, session.user.id);

  return prisma.repositoryClient.upsert({
    where: {
      repositoryId_clientId: {
        repositoryId: repoId,
        clientId: clientId,
      },
    },
    update: {},
    create: {
      repositoryId: repoId,
      clientId: clientId,
    },
  });
}

export async function removeRepoClient(repoId: string, clientId: string) {
  const session = await requireSession();

  if (!repoId || !clientId) {
    throw new Error("repoId and clientId are required");
  }

  await requireOwnedRepository(repoId, session.user.id);

  await prisma.repositoryClient.deleteMany({
    where: { repositoryId: repoId, clientId },
  });

  return { success: true };
}

export async function getRepoClientMap() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    const repositories = await prisma.repository.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        fullName: true,
        url: true,
        repositoryClients: {
          select: {
            deliveredAt: true,
            client: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return repositories;
  } catch (error) {
    console.error("Error while fetching Connected Repo :", error);
    throw error;
  }
}

export async function sendEmail(repositoryId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    if (!repositoryId) {
      throw new Error("Repository ID is required");
    }

    await requireOwnedRepository(repositoryId, session.user.id);

    let queuedWithInngest = false;
    if (process.env.INNGEST_EVENT_KEY) {
      try {
        await inngest.send({
          name: "repo.weekly.summary",
          data: {
            repositoryId,
            triggeredBy: "manual",
            userId: session.user.id,
            managerEmail: session.user.email, 
          },
        });
        queuedWithInngest = true;
      } catch (inngestErr) {
        console.warn("Inngest dispatch failed for repo.weekly.summary, falling back to direct delivery:", inngestErr);
      }
    }

    if (!queuedWithInngest) {
      // Direct execution fallback
      const repo = await prisma.repository.findUnique({
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

      if (!repo) {
        throw new Error("Repository not found or access denied.");
      }

      if (repo.repositoryClients.length === 0) {
        throw new Error("No clients mapped to this repository. Please map a client to this repository before sending the report.");
      }

      const aiSummary = await generateRepoSummary(repo);
      const { sendMail, wrapEmailTemplate } = await import("@/lib/mail");
      const emailHtml = wrapEmailTemplate(aiSummary.html, repo.name);

      let sentCount = 0;
      for (const rc of repo.repositoryClients) {
        try {
          await sendMail({
            to: rc.client.email,
            subject: `Weekly Update - ${repo.name}`,
            html: emailHtml,
            cc: session.user.email,
          });
          await prisma.repositoryClient.update({
            where: { id: rc.id },
            data: { deliveredAt: new Date() },
          });
          sentCount++;
        } catch (mailErr) {
          console.error(`Failed to send email to ${rc.client.email}:`, mailErr);
          throw mailErr;
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error during sending email: ", error);
    throw error;
  }
}
