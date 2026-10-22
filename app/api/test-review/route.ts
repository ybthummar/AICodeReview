import { NextRequest, NextResponse } from "next/server";
import { reviewPullRequest } from "@/module/ai/actions/index";

export async function GET(req: NextRequest) {
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
