"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Infinity as InfinityIcon, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getUsageSummary } from "@/module/billing/actions";
import type { UsageKind } from "@/module/billing/lib/usage";

export const USAGE_QUERY_KEY = ["usage-summary"];
const compactLabels = { reviews: "reviews", chats: "questions", toolkit: "Toolkit runs" };

function barColor(ratio: number) {
  if (ratio >= 1) return "bg-rose-500";
  if (ratio >= 0.8) return "bg-amber-500";
  return "bg-blue-500";
}

export default function UsageMeter({ compact = false, kind = "reviews" }: { compact?: boolean; kind?: UsageKind }) {
  const { data } = useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: async () => await getUsageSummary(),
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });

  if (!data) return null;

  const resetDate = new Date(data.resetsAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (compact) {
    const item = data.items.find((entry) => entry.kind === kind);
    if (!item) return null;
    const label = compactLabels[kind];

    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
        <Zap className="h-3.5 w-3.5 text-blue-600" />
        {item.limit === null ? (
          <>
            {item.used} {label} this month <InfinityIcon className="h-3 w-3" aria-label="Unlimited" />
          </>
        ) : (
          `${item.used}/${item.limit} ${label} this month`
        )}
      </span>
    );
  }

  return (
    <Card className="border border-slate-200/80 bg-white shadow-sm">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Monthly usage</p>
            <p className="text-xs text-slate-500">
              {data.unlimited ? "Unlimited on your plan" : `Resets on ${resetDate}`}
            </p>
          </div>
          {!data.unlimited && (
            <Link
              href="/dashboard/subscriptions"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Upgrade for unlimited
            </Link>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {data.items.map((item) => {
            const ratio = item.limit ? Math.min(1, item.used / item.limit) : 0;
            return (
              <div key={item.kind} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="font-semibold text-slate-900">
                    {item.limit === null ? item.used : `${item.used} / ${item.limit}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.limit === null ? "bg-emerald-500" : barColor(ratio)
                    }`}
                    style={{ width: item.limit === null ? "100%" : `${ratio * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
