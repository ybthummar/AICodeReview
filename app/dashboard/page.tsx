"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  GitCommit,
  GitPullRequest,
  GitBranch,
  MessageSquare,
  Loader2,
  Clock10,
  TrendingUp,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  getDashboardStats,
  getMonthlyActivity,
} from "@/module/dashboard/actions";
import ContributionGraph from "@/module/dashboard/components/contribution-graph";
import type {
  DashboardStats,
  MonthlyActivity,
  StatCardProps,
} from "@/types/dashboard/types";
import { useSession } from "@/lib/auth-client";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "Good Morning";
  }
  if (hour < 18) {
    return "Good Afternoon";
  }
  return "Good Evening";
};

interface EnhancedStatCardProps extends StatCardProps {
  badge?: string;
  bgTint?: string;
}

const StatCard: React.FC<EnhancedStatCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor,
  bgTint = "bg-blue-50",
}) => (
  <Card className="shadow-md border border-slate-200/80 bg-white hover:shadow-lg hover:border-blue-200 transition-all duration-300">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
      <CardTitle className="text-sm font-medium text-slate-500">
        {title}
      </CardTitle>
      <div className={`p-2.5 rounded-xl ${bgTint} flex items-center justify-center`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="text-3xl font-bold text-slate-900 tracking-tight leading-normal pb-1">
        {value.toLocaleString()}
      </div>
      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
        <TrendingUp className="w-3 h-3 text-emerald-500" />
        <span>Synced with GitHub</span>
      </p>
    </CardContent>
  </Card>
);

function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user;

  const { data: stats, isLoading: isLoadingStats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => getDashboardStats(),
    refetchOnWindowFocus: false,
  });

  const { data: monthlyActivity, isLoading: isLoadingActivity } = useQuery<
    MonthlyActivity[]
  >({
    queryKey: ["monthly-activity"],
    queryFn: async () => getMonthlyActivity(),
    refetchOnWindowFocus: false,
  });

  const loadingState = (
    <div className="min-h-[400px] flex flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <span className="text-base text-slate-600 font-medium">Loading your developer dashboard...</span>
    </div>
  );

  if (isLoadingStats) {
    return loadingState;
  }

  const dashboardStats = stats || {
    totalCommits: 0,
    totalPRs: 0,
    totalReviews: 0,
    totalRepos: 0,
  };
  const chartData = monthlyActivity || [];

  return (
    <div className="px-2 sm:px-6 lg:px-8 py-4 min-h-screen max-w-7xl mx-auto space-y-8">
      {/* Header Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
            {getGreeting()}, {user?.name || "Developer"} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of your GitHub repositories, pull requests, and automated AI code reviews.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Commits"
          value={dashboardStats.totalCommits}
          icon={GitCommit}
          iconColor="text-emerald-600"
          bgTint="bg-emerald-50"
        />
        <StatCard
          title="Pull Requests"
          value={dashboardStats.totalPRs}
          icon={GitPullRequest}
          iconColor="text-blue-600"
          bgTint="bg-blue-50"
        />
        <StatCard
          title="AI Reviews Given"
          value={dashboardStats.totalReviews}
          icon={MessageSquare}
          iconColor="text-indigo-600"
          bgTint="bg-indigo-50"
        />
        <StatCard
          title="Monitored Repos"
          value={dashboardStats.totalRepos}
          icon={GitBranch}
          iconColor="text-amber-600"
          bgTint="bg-amber-50"
        />
      </div>

      {/* Main Activity Heatmap */}
      <div className="grid gap-6 grid-cols-1">
        <ContributionGraph />
      </div>

      {/* Monthly Breakdown Chart */}
      <div className="grid gap-6 grid-cols-1">
        <Card className="shadow-md border border-slate-200/80 hover:shadow-lg transition-all duration-300 bg-white">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 gap-2">
            <div>
              <CardTitle className="text-xl font-semibold flex items-center gap-2 text-slate-900">
                <Clock10 className="w-5 h-5 text-blue-600" /> Last 6 Months Activities
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Comparative breakdown of automated AI code reviews, git commits, and pull requests
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 h-[320px]">
            {isLoadingActivity ? (
              <div className="flex items-center justify-center h-full text-slate-500 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-sm">Loading activity breakdown...</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
                      fontSize: "13px",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: "12px", fontSize: "13px" }}
                  />

                  <Bar
                    dataKey="reviews"
                    fill="#3b82f6"
                    name="AI Reviews"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="commits"
                    fill="#10b981"
                    name="Commits"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="prs"
                    fill="#8b5cf6"
                    name="Pull Requests"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default DashboardPage;
