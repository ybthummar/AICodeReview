"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Github, Loader2, Plug, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getGitHubAppStatus, unlinkGitHubInstallation } from "@/module/github/actions";

export default function GitHubAppCard() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["github-app-status"],
    queryFn: async () => await getGitHubAppStatus(),
    refetchOnWindowFocus: false,
  });

  // The callback route redirects back here with the outcome in the query string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("github_app");
    if (!status) return;

    if (status === "linked") {
      toast.success("GitHub App installation linked");
      void queryClient.invalidateQueries({ queryKey: ["github-app-status"] });
    } else {
      toast.error(params.get("message") || "Could not link the GitHub App installation.");
    }

    params.delete("github_app");
    params.delete("message");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [queryClient]);

  const unlink = async (id: string) => {
    setBusyId(id);
    try {
      const result = await unlinkGitHubInstallation(id);
      if (result.ok) {
        toast.success("Installation unlinked");
        void queryClient.invalidateQueries({ queryKey: ["github-app-status"] });
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Could not unlink the installation.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-blue-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Plug className="h-5 w-5 text-blue-600" /> GitHub App
        </CardTitle>
        <CardDescription>
          Install the RepoPilot GitHub App on your account or organization. Reviews then run with short-lived app
          tokens and webhooks arrive without per-repository setup.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Checking installations...
          </div>
        ) : !data?.configured ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
            The GitHub App is not configured on this server. Set <code>GITHUB_APP_ID</code>,{" "}
            <code>GITHUB_APP_PRIVATE_KEY</code> and <code>GITHUB_APP_SLUG</code> to enable it. Connected repositories
            keep working through your GitHub sign-in until then.
          </p>
        ) : (
          <>
            {data.installations.length > 0 ? (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {data.installations.map((installation) => (
                  <li key={installation.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Github className="h-4 w-4 text-slate-500" />
                    <span className="flex-1 truncate text-sm font-semibold text-slate-900">
                      {installation.accountLogin}
                    </span>
                    <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">
                      {installation.accountType}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === installation.id}
                      onClick={() => unlink(installation.id)}
                      className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Unlink installation"
                    >
                      {busyId === installation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No installations linked yet.</p>
            )}

            {data.installUrl && (
              <Button asChild className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                <a href={data.installUrl}>
                  <Github className="h-4 w-4" />
                  {data.installations.length > 0 ? "Install on another account" : "Install the GitHub App"}
                </a>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
