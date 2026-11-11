"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ClipboardList, Download, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuditLog } from "@/module/audit/actions";
import { AUDIT_ACTIONS } from "@/module/audit/lib/actions";

function actionLabel(action: string): string {
  return action.replace(/[._]/g, " ");
}

export default function AuditPage() {
  const [action, setAction] = useState("");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["audit-log", action],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const result = await getAuditLog({ cursor: pageParam, action: action || null });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchOnWindowFocus: false,
  });

  const entries = data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <div className="mx-auto min-h-screen max-w-5xl space-y-6 px-2 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
            <ClipboardList className="h-7 w-7 text-blue-600" /> Audit log &amp; reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Who changed what across your repositories, rules, workspaces and keys.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="/api/export/findings" download>
              <Download className="h-4 w-4" /> Findings CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="/api/reports/weekly?days=7" target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4" /> Weekly report
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="/api/reports/weekly?days=30" target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4" /> Monthly report
            </a>
          </Button>
        </div>
      </div>

      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Activity</CardTitle>
            <CardDescription>
              Your own actions, plus everything inside workspaces where you are an owner or admin.
            </CardDescription>
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Loading activity...
            </div>
          ) : entries.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <Badge variant="outline" className="w-fit shrink-0 border-slate-300 bg-slate-50 font-mono text-[11px] text-slate-600">
                    {actionLabel(entry.action)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900">{entry.summary}</p>
                    <p className="text-xs text-slate-500">
                      {entry.actor ? `${entry.actor.name} (${entry.actor.email})` : "Deleted account"}
                      {entry.scope === "workspace" ? " · workspace" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400" title={new Date(entry.createdAt).toLocaleString()}>
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
                {isFetchingNextPage ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
