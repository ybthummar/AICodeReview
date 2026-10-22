"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAdminDashboardData,
  adminUpdateUserSubscription,
} from "@/module/admin/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  GitBranch,
  MessageSquare,
  Crown,
  Search,
  Loader2,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-dashboard-data"],
    queryFn: async () => {
      return await getAdminDashboardData();
    },
    refetchOnWindowFocus: false,
  });

  const { mutate: updateSubscription } = useMutation({
    mutationFn: async ({
      userId,
      tier,
      status,
    }: {
      userId: string;
      tier: "FREE" | "PRO" | "ADMIN";
      status: "ACTIVE" | "INACTIVE" | "CANCELLED";
    }) => {
      setUpdatingUserId(userId);
      return await adminUpdateUserSubscription(userId, tier, status);
    },
    onSuccess: () => {
      toast.success("User subscription updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard-data"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update subscription");
    },
    onSettled: () => {
      setUpdatingUserId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="text-slate-600 font-medium">Loading Administrator Console...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-red-200 bg-red-50/50 p-6 text-center">
          <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900 mb-1">Access Denied</h2>
          <p className="text-sm text-slate-600 mb-4">
            {error instanceof Error ? error.message : "You do not have administrative privileges."}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const { kpis, users, recentReviews } = data!;

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-2 sm:px-6 lg:px-8 py-4 min-h-screen max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Admin Control Panel
            </h1>
            <Badge className="bg-purple-100 text-purple-700 border-purple-300 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Super Admin
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage users, grant unlimited repository access, inspect subscriptions, and monitor AI code reviews.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link href="/dashboard/reviews">
              <MessageSquare className="w-3.5 h-3.5" /> View Reviews Feed
            </Link>
          </Button>
          <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs">
            <Link href="/dashboard/repositories">
              <GitBranch className="w-3.5 h-3.5" /> Manage Repositories
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Users
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{kpis.totalUsers}</div>
            <p className="text-xs text-slate-500 mt-1">Registered developer accounts</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active PRO Subscribers
            </CardTitle>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Crown className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{kpis.proUsers}</div>
            <p className="text-xs text-emerald-600 font-medium mt-1">
              {kpis.totalUsers > 0
                ? `${Math.round((kpis.proUsers / kpis.totalUsers) * 100)}% conversion rate`
                : "Active tier"}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Connected Repos
            </CardTitle>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <GitBranch className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{kpis.totalRepos}</div>
            <p className="text-xs text-slate-500 mt-1">Synced with GitHub Webhooks</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              AI Code Reviews
            </CardTitle>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Sparkles className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{kpis.totalReviews}</div>
            <p className="text-xs text-slate-500 mt-1">Total pull requests analyzed</p>
          </CardContent>
        </Card>
      </div>

      {/* User Management & Subscription Control Table */}
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 gap-3">
          <div>
            <CardTitle className="text-xl font-bold text-slate-900">
              User Accounts & Subscription Controls
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1">
              Grant PRO status directly, inspect plans, and manage account privileges.
            </CardDescription>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Joined</th>
                <th className="py-3 px-4">Repos</th>
                <th className="py-3 px-4">Current Tier</th>
                <th className="py-3 px-4 text-right">Admin Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                    No users matching &quot;{searchQuery}&quot;
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isUserPro =
                    user.subscriptionTier === "PRO" &&
                    user.subscriptionStatus === "ACTIVE";
                  const isUpdating = updatingUserId === user.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900 flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.image || undefined} />
                          <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-bold">
                            {user.name?.slice(0, 2).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <span>{user.name}</span>
                        {user.isAdmin && (
                          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0 font-bold">
                            ADMIN
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-600 text-xs font-mono">
                        {user.email}
                      </td>

                      <td className="py-3 px-4 text-slate-500 text-xs">
                        {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-semibold text-xs">
                        {user._count.repositories}
                      </td>

                      <td className="py-3 px-4">
                        {user.isAdmin ? (
                          <Badge className="bg-purple-100 text-purple-700 border-purple-300 font-semibold text-xs">
                            UNLIMITED
                          </Badge>
                        ) : isUserPro ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold text-xs flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" /> PRO (Active)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-600 border-slate-300 text-xs">
                            FREE (1 Repo)
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {user.isAdmin ? (
                          <span className="text-xs text-slate-400 italic">Full Access</span>
                        ) : isUserPro ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isUpdating}
                            onClick={() =>
                              updateSubscription({
                                userId: user.id,
                                tier: "FREE",
                                status: "CANCELLED",
                              })
                            }
                            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                          >
                            {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Revoke to FREE"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={isUpdating}
                            onClick={() =>
                              updateSubscription({
                                userId: user.id,
                                tier: "PRO",
                                status: "ACTIVE",
                              })
                            }
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                          >
                            {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Grant PRO Tier"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* System-wide Code Review Activity Feed */}
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-slate-900">
                System-Wide Code Reviews
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Latest pull requests processed by the AI pipeline across all user repositories.
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs text-blue-600 gap-1">
              <Link href="/dashboard/reviews">
                Open Reviews Page <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 p-0">
          {recentReviews.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              No reviews have been generated in the system yet.
            </div>
          ) : (
            recentReviews.map((rev) => (
              <div key={rev.id} className="p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-sm">
                      {rev.prTitle}
                    </span>
                    <Badge variant="outline" className="text-blue-600 border-blue-200 text-xs">
                      {rev.repository?.fullName || "repo"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    PR #{rev.prNumber} • {formatDistanceToNow(new Date(rev.createdAt), { addSuffix: true })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      rev.status === "completed"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : rev.status === "failed"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }
                  >
                    {rev.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
