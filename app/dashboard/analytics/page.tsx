"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  FileWarning,
  GitMerge,
  Loader2,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEngineeringAnalytics } from "@/module/analytics/actions";

const WINDOWS = [7, 30, 90] as const;

function formatHours(hours: number | null): string {
  if (hours === null) return "-";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return formatHours(minutes / 60);
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-blue-600 bg-blue-50",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="border border-slate-200/80 bg-white shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function riskTone(risk: number | null): string {
  if (risk === null) return "text-slate-400";
  if (risk >= 60) return "text-rose-600";
  if (risk >= 30) return "text-amber-600";
  return "text-emerald-600";
}

export default function AnalyticsPage() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["engineering-analytics", days],
    queryFn: async () => await getEngineeringAnalytics(days),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const analytics = data?.ok ? data.data : null;

  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-6 px-2 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
            <BarChart3 className="h-7 w-7 text-blue-600" /> Engineering Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Delivery speed and review quality across your connected repositories.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {WINDOWS.map((window) => (
            <Button
              key={window}
              type="button"
              size="sm"
              variant={days === window ? "default" : "ghost"}
              onClick={() => setDays(window)}
              className={days === window ? "bg-blue-600 text-white hover:bg-blue-700" : "text-slate-600"}
            >
              {window} days
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Reading pull request history...
        </div>
      )}

      {(isError || (data && !data.ok)) && (
        <Card className="border border-rose-200 bg-rose-50">
          <CardContent className="p-4 text-sm text-rose-700">
            {data && !data.ok ? data.error : "Could not load analytics."}
          </CardContent>
        </Card>
      )}

      {analytics && (
        <>
          {analytics.skippedRepositories.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                GitHub could not be reached for {analytics.skippedRepositories.join(", ")}. Those repositories are
                left out of these numbers.
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={GitMerge}
              label="Merged pull requests"
              value={String(analytics.pullRequests.merged)}
              hint={`${analytics.pullRequests.closedUnmerged} closed without merging`}
            />
            <Metric
              icon={Timer}
              label="Median cycle time"
              value={formatHours(analytics.medianCycleHours)}
              hint="Opened to merged"
              tone="text-violet-600 bg-violet-50"
            />
            <Metric
              icon={Clock}
              label="Time to first AI review"
              value={formatMinutes(analytics.medianFirstReviewMinutes)}
              hint="Median, opened to first review"
              tone="text-sky-600 bg-sky-50"
            />
            <Metric
              icon={ShieldCheck}
              label="Reviewed before merge"
              value={analytics.reviewedBeforeMergeRate === null ? "-" : `${analytics.reviewedBeforeMergeRate}%`}
              hint={
                analytics.mergedWithBlockingFindings > 0
                  ? `${analytics.mergedWithBlockingFindings} merged with open high-severity findings`
                  : "No merges with open high-severity findings"
              }
              tone={
                analytics.mergedWithBlockingFindings > 0
                  ? "text-rose-600 bg-rose-50"
                  : "text-emerald-600 bg-emerald-50"
              }
            />
          </div>

          <Card className="border border-slate-200/80 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">Weekly throughput</CardTitle>
              <CardDescription>Merged pull requests per week and their median cycle time in hours.</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.weekly.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  No merged pull requests in the last {analytics.windowDays} days.
                </p>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={analytics.weekly} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} />
                      <YAxis yAxisId="left" allowDecimals={false} stroke="#64748b" fontSize={12} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={12} tickLine={false} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="merged" name="Merged PRs" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="medianCycleHours"
                        name="Median cycle (h)"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Users className="h-5 w-5 text-blue-600" /> Authors
                </CardTitle>
                <CardDescription>Average risk and quality come from the latest AI review of each pull request.</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.authors.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">No activity in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="py-2 pr-3 font-semibold">Author</th>
                          <th className="px-3 py-2 font-semibold">Merged</th>
                          <th className="px-3 py-2 font-semibold">Cycle</th>
                          <th className="px-3 py-2 font-semibold">Avg risk</th>
                          <th className="py-2 pl-3 font-semibold">Avg quality</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analytics.authors.map((author) => (
                          <tr key={author.author}>
                            <td className="py-2 pr-3 font-medium text-slate-900">{author.author}</td>
                            <td className="px-3 py-2 text-slate-700">{author.merged}</td>
                            <td className="px-3 py-2 text-slate-700">{formatHours(author.medianCycleHours)}</td>
                            <td className={`px-3 py-2 font-semibold ${riskTone(author.avgRisk)}`}>
                              {author.avgRisk ?? "-"}
                            </td>
                            <td className="py-2 pl-3 text-slate-700">{author.avgQuality ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-slate-200/80 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <FileWarning className="h-5 w-5 text-amber-600" /> Riskiest files
                </CardTitle>
                <CardDescription>Files that attracted the most findings across reviewed pull requests.</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.riskyFiles.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">No file-level findings in this period.</p>
                ) : (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={analytics.riskyFiles.map((file) => ({
                          name: file.file.split("/").slice(-2).join("/"),
                          full: `${file.repoFullName}: ${file.file}`,
                          findings: file.findings,
                          blocking: file.blocking,
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} stroke="#64748b" fontSize={12} />
                        <YAxis type="category" dataKey="name" width={140} stroke="#64748b" fontSize={11} tickLine={false} />
                        <Tooltip
                          labelFormatter={(_, payload) => (payload?.[0]?.payload as { full?: string })?.full ?? ""}
                        />
                        <Legend />
                        <Bar dataKey="findings" name="All findings" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="blocking" name="High / critical" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
