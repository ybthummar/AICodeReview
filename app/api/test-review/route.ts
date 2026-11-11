import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import { reviewPullRequest } from "@/module/ai/actions/index";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const prNumber = parseInt(searchParams.get("pr") || "1", 10);

  if (!owner || !repo) {
    return NextResponse.json(
      {
        message: "Missing query parameters",
        usage: "/api/test-review?owner=your-github-username&repo=your-repo&pr=1",
      },
      { status: 400 }
    );
  }

  const repository = await prisma.repository.findFirst({
    where: {
      owner: { equals: owner, mode: "insensitive" },
      name: { equals: repo, mode: "insensitive" },
      ...(isAdminUser(session.user) ? {} : { userId: session.user.id }),
    },
    select: { id: true },
  });

  if (!repository) {
    return NextResponse.json(
      { success: false, error: "Repository is not connected to your account" },
      { status: 403 }
    );
  }

  try {
    const result = await reviewPullRequest(owner, repo, prNumber);
    return NextResponse.json({
      success: true,
      result,
      viewReviewsUrl: "/dashboard/reviews",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
