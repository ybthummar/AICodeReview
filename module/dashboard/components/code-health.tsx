"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, HeartPulse, Loader2, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getReviewInsightsOverview } from "@/module/review/actions";
import {
  RiskBadge,
  ScoreRing,
  SEVERITY_STYLES,
  VerdictBadge,
} from "@/module/review/components/insights-panel";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  VERDICT_LABELS,
  VERDICTS,
} from "@/module/review/lib/insights";

const VERDICT_BAR_COLORS = {
  approve: "bg-emerald-500",
  request_changes: "bg-rose-500",
  informational: "bg-slate-400",
} as const;

export default function CodeHealth() {
  const { data, isLoading } = useQuery({
    queryKey: ["review-insights-overview"],
    queryFn: async () => await getReviewInsightsOverview(),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="shadow-md border border-slate-200/80 bg-white">
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2 text-slate-900">
            <HeartPulse className="w-5 h-5 text-rose-500" /> Code Health
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[180px] flex items-center justify-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Analyzing review insights...</span>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.analyzedReviews === 0) {
    return (
      <Card className="shadow-md border border-dashed border-slate-300 bg-white">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">
              Code Health appears after your first AI review
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Every review is scored for quality, security and risk, and findings are tracked
              by severity so you can see how your codebase is trending.
            </p>
          </div>
          <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Link href="/dashboard/reviews">Run an AI review</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalFindings = SEVERITIES.reduce((sum, s) => sum + data.severityCounts[s], 0);
  const maxCategory = Math.max(1, ...CATEGORIES.map((c) => data.categoryCounts[c]));
  const totalVerdicts = Math.max(1, data.analyzedReviews);

  return (
    <Card className="shadow-md border border-slate-200/80 bg-white hover:shadow-lg transition-all duration-300">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <CardTitle className="text-xl font-semibold flex items-center gap-2 text-slate-900">
            <HeartPulse className="w-5 h-5 text-rose-500" /> Code Health
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Aggregated from {data.analyzedReviews} AI-analyzed pull request
            {data.analyzedReviews === 1 ? "" : "s"} across your connected repositories
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-xs text-blue-600 gap-1 self-start">
          <Link href="/dashboard/reviews">
            All reviews <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Scores & verdicts */}
          <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-around">
              <ScoreRing value={data.avgQuality ?? 0} label="Quality" />
              <ScoreRing value={data.avgSecurity ?? 0} label="Security" />
              <ScoreRing value={data.avgRisk ?? 0} label="Risk" invert />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Review verdicts
              </p>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                {VERDICTS.map((v) => (
                  <div
                    key={v}
                    className={VERDICT_BAR_COLORS[v]}
                    style={{ width: `${(data.verdicts[v] / totalVerdicts) * 100}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {VERDICTS.map((v) => (
                  <span key={v} className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${VERDICT_BAR_COLORS[v]}`} />
                    {VERDICT_LABELS[v]} <strong className="text-slate-900">{data.verdicts[v]}</strong>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Fix rate
                </p>
                <span className="text-xs font-semibold text-slate-900">
                  {data.resolution.rate === null ? "No findings tracked" : `${data.resolution.rate}%`}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${data.resolution.rate ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">
                {data.resolution.resolved + data.resolution.autoResolved} fixed · {data.resolution.open} open
                {data.resolution.dismissed > 0 ? ` · ${data.resolution.dismissed} dismissed` : ""}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Review accuracy
                </p>
                <span className="text-xs font-semibold text-slate-900">
                  {data.feedback.up + data.feedback.down === 0
                    ? "No votes yet"
                    : `${Math.round((data.feedback.up / (data.feedback.up + data.feedback.down)) * 100)}% helpful`}
                </span>
              </div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${
                      data.feedback.up + data.feedback.down === 0
                        ? 0
                        : (data.feedback.up / (data.feedback.up + data.feedback.down)) * 100
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-500">
                {data.feedback.up} helpful · {data.feedback.down} not helpful. Votes on findings teach
                RepoPilot what to stop flagging.
              </p>
            </div>
          </div>

          {/* Findings breakdown */}
          <div className="space-y-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Findings by category (open)
              </p>
              <span className="text-xs text-slate-500">{totalFindings} total</span>
            </div>

            <div className="space-y-2.5">
              {CATEGORIES.map((category) => (
                <div key={category} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 text-slate-600">{CATEGORY_LABELS[category]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${(data.categoryCounts[category] / maxCategory) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-semibold text-slate-900">
                    {data.categoryCounts[category]}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {SEVERITIES.map((s) => (
                <span
                  key={s}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[s].badge}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_STYLES[s].dot}`} />
                  {data.severityCounts[s]} {SEVERITY_LABELS[s]}
                </span>
              ))}
            </div>
          </div>

          {/* Needs attention */}
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Needs attention
            </p>

            {data.attention.length === 0 ? (
              <p className="text-sm text-slate-500">
                No risky pull requests. Everything analyzed so far looks healthy.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.attention.map((item) => (
                  <li key={item.id}>
                    <Link
                      href="/dashboard/reviews"
                      className="block rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                          #{item.prNumber} {item.prTitle}
                        </p>
                        <RiskBadge level={item.riskLevel} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono">{item.repoFullName}</span>
                        <VerdictBadge verdict={item.verdict} />
                        <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {data.trend.length >= 2 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Weekly trend
            </p>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#64748b" fontSize={12} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid #e2e8f0",
                      fontSize: "13px",
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "13px" }} />
                  <Line type="monotone" dataKey="quality" name="Quality" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="security" name="Security" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="risk" name="Risk" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
