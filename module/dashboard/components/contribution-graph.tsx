"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUserContributionStats } from "../actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Zap, Calendar, Sparkles, RefreshCw } from "lucide-react";
import ActivityHeatmap, { type ActivityDay } from "@/components/ui/activity-heatmap";
import { Button } from "@/components/ui/button";

export default function ContributionGraph() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["contribution-graph"],
    queryFn: async () => {
      return await getUserContributionStats();
    },
    staleTime: 1000 * 60 * 5,
  });

  // Generate fallback/demo 365 days of activity
  const demoDays = useMemo<ActivityDay[]>(() => {
    const days: ActivityDay[] = [];
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 364);
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      const roll = rand();
      const count =
        roll > 0.72
          ? Math.floor(roll * 12)
          : roll > 0.4
            ? Math.floor(roll * 4)
            : 0;
      days.push({ date: new Date(t).toISOString().slice(0, 10), count });
    }
    return days;
  }, []);

  // Compute active days list
  const heatmapDays = useMemo<ActivityDay[]>(() => {
    if (showDemo) {
      return demoDays;
    }
    if (data?.contributions && data.contributions.length > 0) {
      return data.contributions.map((c: { date: string; count: number }) => ({
        date: c.date,
        count: c.count,
      }));
    }
    // Fallback: 365 empty days if GitHub hasn't returned contributions yet
    const fallback: ActivityDay[] = [];
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 364);
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      fallback.push({ date: new Date(t).toISOString().slice(0, 10), count: 0 });
    }
    return fallback;
  }, [showDemo, demoDays, data]);

  const selectedDayInfo = useMemo(() => {
    if (!selectedDate) return null;
    const match = heatmapDays.find((d) => d.date === selectedDate);
    const count = match ? match.count : 0;
    const formatted = new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }
    );
    return { count, formatted };
  }, [selectedDate, heatmapDays]);

  if (isLoading) {
    return (
      <Card className="shadow-md border border-slate-200/80 bg-white">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xl font-semibold flex items-center gap-2 text-slate-900">
            <Zap className="w-5 h-5 text-blue-600" /> Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[220px] flex flex-col items-center justify-center text-slate-500 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-sm">Loading activity graph...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border border-slate-200/80 bg-white hover:shadow-lg transition-all duration-300">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 gap-2">
        <div>
          <CardTitle className="text-xl font-semibold flex items-center gap-2 text-slate-900">
            <Zap className="w-5 h-5 text-blue-600" /> Code & Review Activity
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Visualizing GitHub commits, PRs, and AI code reviews across 52 weeks
          </CardDescription>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {selectedDayInfo && (
            <div className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5 font-medium animate-in fade-in duration-200">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {selectedDayInfo.formatted}: {selectedDayInfo.count} {selectedDayInfo.count === 1 ? "activity" : "activities"}
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDemo(!showDemo)}
            className="text-xs h-8 text-slate-600 hover:text-slate-900"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" />
            {showDemo ? "Show Live GitHub" : "Preview Demo"}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 w-8 text-slate-500 hover:text-slate-900"
            title="Refresh activity"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 overflow-hidden">
        <ActivityHeatmap
          days={heatmapDays}
          label="Contributions in the last year"
          period="the last year"
          unit={{ one: "contribution", other: "contributions" }}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </CardContent>
    </Card>
  );
}
