import { NextRequest, NextResponse } from "next/server";
import { buildFindingsCsv } from "@/module/reports/lib/export";
import { getSessionUser, loadExportReviews } from "@/module/reports/lib/load";

// Downloads every finding from the reviews you can access as a CSV file.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const repositoryId = request.nextUrl.searchParams.get("repositoryId");
  const reviews = await loadExportReviews(user.id, { repositoryId });

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buildFindingsCsv(reviews), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="repopilot-findings-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
