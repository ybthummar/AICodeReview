"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/db";
import { deleteWebhook } from "@/module/github/lib/github";
import { purgeRepositoryVectors } from "@/module/ai/lib/rag";
import { recordAudit } from "@/module/audit/lib/audit";

export async function getUserProfile() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    });

    return user;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

// Email is owned by the GitHub login and drives admin checks, so only the display name is editable.
export async function updateUserProfile(data: { name?: string }): Promise<{
  success: boolean;
  error?: string;
  user?: { id: string; name: string; email: string };
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    const name = data.name?.trim() ?? "";
    if (name.length < 1 || name.length > 80) {
      return {
        success: false,
        error: "Display name must be between 1 and 80 characters",
      };
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { name },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    revalidatePath("/dashboard/settings", "page");

    return {
      success: true,
      user: updatedUser,
    };
  } catch (error) {
    console.error("Error updating user profile:", error);
    return {
      success: false,
      error: "Failed to update profile",
    };
  }
}

export async function getConnectedRepositories() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    const repositories = await prisma.repository.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        fullName: true,
        url: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return repositories;
  } catch (error) {
    console.error("Error fetching connected repositories:", error);
    return [];
  }
}

export async function disconnectRepository(repositoryId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    const repository = await prisma.repository.findUnique({
      where: {
        id: repositoryId,
        userId: session.user.id,
      },
    });

    if (!repository) {
      throw new Error("Repository not found");
    }

    await deleteWebhook(repository.owner, repository.name);
    await purgeRepositoryVectors(repository.fullName);

    await prisma.repository.delete({
      where: {
        id: repositoryId,
        userId: session.user.id,
      },
    });

    await recordAudit({
      userId: session.user.id,
      action: "repository.disconnected",
      targetType: "repository",
      targetId: repository.id,
      summary: `Disconnected ${repository.fullName}`,
    });

    revalidatePath("/dashboard/settings", "page");
    revalidatePath("/dashboard/repositories", "page");

    return { success: true };
  } catch (error) {
    console.error("Error disconnecting repository:", error);
    return { success: false, error: "Failed to disconnect repository" };
  }
}

export async function dissconnectAllRepository() {
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
    });

    await Promise.all(
      repositories.map(async (repo) => {
        await deleteWebhook(repo.owner, repo.name);
        await purgeRepositoryVectors(repo.fullName);
      })
    );

    const result = await prisma.repository.deleteMany({
      where: {
        userId: session.user.id,
      },
    });

    await recordAudit({
      userId: session.user.id,
      action: "repository.disconnected",
      summary: `Disconnected all ${repositories.length} repositories`,
    });

    revalidatePath("/dashboard/settings", "page");
    revalidatePath("/dashboard/repositories", "page");

    return { success: true, result };
  } catch (error) {
    console.error("Error disconnecting all repositories:", error);
    return { success: false, error: "Failed to disconnect all repositories" };
  }
}
