"use server";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { inngest } from "@/inngest/client";

type RepoInput = {
  id: string;
  name: string;
  fullName: string;
  reviews: {
    prTitle: string;
    prNumber: number;
    review: string;
    createdAt: Date;
  }[];
};

export async function addClient(name: string, email: string) {
  if (!name || !email) {
    throw new Error("Name and email are required");
  }

  const existing = await prisma.client.findFirst({
    where: { email },
  });

  if (existing) {
    return existing;
  }

  return prisma.client.create({
    data: {
      name,
      email,
    },
  });
}

export async function addRepoClient(repoId: string, clientId: string) {
  if (!repoId || !clientId) {
    throw new Error("repoId and clientId are required");
  }

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

export async function generateRepoSummary(repo: RepoInput) {
  try {
    const reviewContext =
      repo.reviews.length === 0
        ? "No recent pull request reviews available."
        : repo.reviews
            .map(
              (r, i) =>
                `${i + 1}. PR #${r.prNumber} - ${r.prTitle}\nReview: ${
                  r.review
                }`
            )
            .join("\n\n");

    const prompt = `
You are a senior software architect and security reviewer.

Analyze the repository below and generate a WEEKLY CLIENT-FACING SUMMARY.

Repository:
- Name: ${repo.fullName}

Recent Pull Request Reviews:
${reviewContext}

Your task:
1. Summarize the latest implemented features (client-friendly, non-technical tone).
2. Give a SECURITY SCORE from 0 to 100.
3. Give a CODE QUALITY SCORE from 0 to 100.
4. List 3 to 5 clear improvement suggestions.

Rules:
- Be concise.
- Do NOT mention internal tooling.
- Do NOT expose vulnerabilities explicitly.
- Scores must be integers.
- Output MUST be valid JSON in the exact structure below.

Output JSON format:
{
  "summary": string,
  "securityScore": number,
  "codeQualityScore": number,
  "improvements": string[]
}
`;

    const { text } = await generateText({
      model: google("gemini-3.5-flash"),
      temperature: 0.3,
      prompt,
    });

    let parsed;
    try {
      const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(cleanedText);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    return {
      raw: parsed,
      html: `
      <h2>Weekly Project Overview</h2>
      <p>${parsed.summary}</p>

      <h3>Scores</h3>
      <ul>
        <li><b>Security:</b> ${parsed.securityScore} / 100</li>
        <li><b>Code Quality:</b> ${parsed.codeQualityScore} / 100</li>
      </ul>

      <h3>Recommended Improvements</h3>
      <ul>
        ${parsed.improvements.map((i: string) => `<li>${i}</li>`).join("")}
      </ul>
    `,
    };
  } catch (error) {
    console.error("Error while Generating Email Response:", error);
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

      if (repo && repo.repositoryClients.length > 0) {
        const aiSummary = await generateRepoSummary(repo);
        const { sendMail, wrapEmailTemplate } = await import("@/lib/mail");
        const emailHtml = wrapEmailTemplate(aiSummary.html, repo.name);

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
          } catch (mailErr) {
            console.error(`Failed to send email to ${rc.client.email}:`, mailErr);
          }
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error during sending email: ", error);
    throw error;
  }
}
