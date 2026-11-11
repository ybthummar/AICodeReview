"use client";

import type React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  getConnectedRepositories,
  disconnectRepository,
  dissconnectAllRepository,
} from "../actions";
import { toast } from "sonner";
import { ExternalLink, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import RulesDialog from "@/module/review-rules/components/rules-dialog";

interface Repository {
  id: string;
  name: string;
  fullName: string;
  url: string;
}

interface RepoCardProps {
  repo: Repository;
  disconnectMutation: UseMutationResult<MutationResult, Error, string, unknown>;
  isDisconnecting: boolean;
}

type MutationResult = { success: boolean; error?: string };

const RepoCard: React.FC<RepoCardProps> = ({
  repo,
  disconnectMutation,
  isDisconnecting,
}) => {
  const isThisRepoDisconnecting =
    isDisconnecting && disconnectMutation.variables === repo.id;

  return (
    <Card className="border-blue-100 hover:border-blue-300 transition-colors">
      <CardContent className="px-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">
              {repo.name}
            </h3>
            <div className="flex items-center gap-x-3 text-sm text-gray-500 mt-1">
              <div className="w-2 h-2 bg-green-400 border border-green-500 rounded-full" />
              <p className="pt-1">Status : Active</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RulesDialog repositoryId={repo.id} repositoryName={repo.fullName} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1"
                  disabled={isThisRepoDisconnecting}
                >
                  {isThisRepoDisconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center text-red-600">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Disconnect Repository
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Remove AI Code Reviewer from{" "}
                    <strong>{repo.fullName}</strong>. This action cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => disconnectMutation.mutate(repo.id)}
                    disabled={isThisRepoDisconnecting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isThisRepoDisconnecting
                      ? "Disconnecting..."
                      : "Disconnect"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

function RepositoryList() {
  const queryClient = useQueryClient();
  const [disconnectAllOpen, setDisconnectAllOpen] = useState(false);

  const { data: repositories, isLoading } = useQuery<Repository[] | null>({
    queryKey: ["connected-repositories"],
    queryFn: async () => await getConnectedRepositories(),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: async (repositoryId: string) => {
      return await disconnectRepository(repositoryId);
    },
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        toast.success("Repository disconnected successfully");
      } else {
        toast.error(result?.error || "Failed to disconnect repository.");
      }
    },
  });

  const disconnectAllMutation = useMutation({
    mutationFn: async () => {
      return await dissconnectAllRepository();
    },
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        toast.success("All repositories disconnected successfully");
        setDisconnectAllOpen(false);
      } else {
        toast.error(result?.error || "Failed to disconnect all repositories.");
      }
    },
  });

  const repoArray = repositories || [];
  const isEmpty = !isLoading && repoArray.length === 0;

  if (isLoading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="p-12 flex justify-center items-center">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" />
          <span className="text-gray-600">Loading repositories...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-100">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">Connected Repositories</CardTitle>
            <CardDescription>
              {repoArray.length > 0
                ? `${repoArray.length} ${
                    repoArray.length !== 1 ? "repositories" : "repository"
                  } connected`
                : "No repositories connected yet"}
            </CardDescription>
          </div>
          {!isEmpty && (
            <AlertDialog
              open={disconnectAllOpen}
              onOpenChange={setDisconnectAllOpen}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={disconnectAllMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Disconnect All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center text-red-600">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Disconnect All Repositories
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove AI Code Reviewer from all{" "}
                    <strong>{repoArray.length}</strong> repositories. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <div className="flex justify-between"></div>
                  <div>
                    <AlertDialogCancel
                      disabled={disconnectAllMutation.isPending}
                    >
                      Cancel
                    </AlertDialogCancel>
                  </div>
                  <div>
                    <AlertDialogAction
                      onClick={() => disconnectAllMutation.mutate()}
                      disabled={disconnectAllMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {disconnectAllMutation.isPending
                        ? "Disconnecting..."
                        : "Disconnect All"}
                    </AlertDialogAction>
                  </div>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">
              No repositories connected
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Connect repositories to enable AI code reviews
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {repoArray.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                disconnectMutation={disconnectMutation}
                isDisconnecting={disconnectMutation.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RepositoryList;
