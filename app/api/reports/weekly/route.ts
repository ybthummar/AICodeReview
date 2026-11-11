import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { accessibleRepositoryWhere } from "@/module/team/lib/access";
import { getSessionUser, loadExportReviews } from "@/module/reports/lib/load";
import { buildWeeklyReportHtml } from "@/module/reports/lib/weekly";

const ALLOWED_DAYS = [7, 14, 30, 90];

// A printable summary of recent reviews. Use the browser's print dialog to save it as a PDF.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedDays = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(requestedDays) ? requestedDays : 7;
  const repositoryId = request.nextUrl.searchParams.get("repositoryId");

  let scopeLabel = "All repositories";
  if (repositoryId) {
    const repository = await prisma.repository.findFirst({
      where: { AND: [{ id: repositoryId }, accessibleRepositoryWhere(user.id)] },
      select: { fullName: true },
    });
    if (!repository) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    scopeLabel = repository.fullName;
  }

  const generatedAt = new Date();
  const since = new Date(generatedAt.getTime() - days * 24 * 60 * 60 * 1000);
  const reviews = await loadExportReviews(user.id, { repositoryId, since });

  return new NextResponse(buildWeeklyReportHtml({ reviews, days, scopeLabel, generatedAt }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "Cache-Control": "no-store",
    },
  });
}
