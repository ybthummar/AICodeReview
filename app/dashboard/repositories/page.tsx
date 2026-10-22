"use client";

import type React from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink,
  Star,
  Search,
  Loader2,
  CheckCircle,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useRepositories } from "@/module/repository/hooks/use-repositories";
import { useConnectRepository } from "@/module/repository/hooks/use-connect-repository";
import type { Repository, RepositoryCardProps } from "@/types/repository/types";

const RepositoryCardSkeleton = () => {
  return (
    <Card className="flex flex-col justify-between p-5 border border-blue-100 bg-white hover:border-blue-200 transition-all">
      <CardHeader className="p-0 mb-4 space-y-3">
        <div className="flex justify-between items-start">
          <Skeleton className="h-6 w-3/4 bg-blue-50 rounded-md" />
          <Skeleton className="h-5 w-5 rounded-sm bg-blue-50" />
        </div>
        <Skeleton className="h-4 w-full bg-blue-50 rounded-md" />
        <Skeleton className="h-4 w-2/3 bg-blue-50 rounded-md" />
      </CardHeader>
      <CardContent className="p-0 mb-4 space-y-3">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-6 w-16 rounded-full bg-blue-50" />
          <Skeleton className="h-5 w-12 bg-blue-50 rounded-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full bg-blue-50" />
          <Skeleton className="h-6 w-20 rounded-full bg-blue-50" />
        </div>
      </CardContent>
      <Skeleton className="h-10 w-full rounded-lg bg-blue-50" />
    </Card>
  );
};

const RepositoryCard: React.FC<RepositoryCardProps> = ({
  repo,
  onRegister,
  connectingId,
}) => {
  const isConnecting = connectingId === repo.id;

  return (
    <Card
      className={`
        group flex flex-col justify-between p-5 transition-all duration-300 
        border bg-white
        ${
          repo.isConnected
            ? "border-blue-500 shadow-md shadow-blue-100 from-white to-blue-50"
            : "border-blue-100 hover:border-blue-300 hover:shadow-2xl hover:shadow-blue-50"
        }
      `}
    >
      <CardHeader className="p-0 space-y-2">
        <div className="flex justify-between items-start gap-3">
          <CardTitle className="text-lg font-semibold text-gray-900 transition-colors line-clamp-1">
            {repo.name}
          </CardTitle>
          <a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-blue-600 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
        <CardDescription className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
          {repo.description || "No description"}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0 mb-5 space-y-3">
        <div className="flex justify-between items-center gap-3 text-sm flex-wrap">
          <div className="flex items-center gap-x-2">
            {repo.isConnected && (
              <Badge
                variant="outline"
                className="text-green-700 font-medium border border-green-700 px-2.5 py-0.5"
              >
                <CheckCircle className="w-3 h-3 mr-1.5" />
                Connected
              </Badge>
            )}

            {repo.language && (
              <Badge
                variant="outline"
                className="text-blue-700 font-medium border border-blue-700"
              >
                {repo.language}
              </Badge>
            )}
          </div>

          <div>
            <span className="flex items-center text-gray-600 text-xs font-medium">
              <Star className="w-4 h-4 mr-1 text-blue-500 fill-blue-500" />
              {repo.stargazers_count.toLocaleString()}
            </span>
          </div>
        </div>

        {repo.topics && repo.topics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {repo.topics.slice(0, 3).map((topic, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs text-blue-600 border-blue-200 bg-blue-50 font-normal"
              >
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <div className="pt-4 border-t border-blue-100">
        <Button
          onClick={() => onRegister(repo)}
          disabled={isConnecting}
          className={`w-full font-semibold transition-all duration-200 ${
            repo.isConnected
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {isConnecting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : repo.isConnected ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Connected
            </>
          ) : (
            <>
              <GitBranch className="mr-2 h-4 w-4" />
              Connect Repository
            </>
          )}
        </Button>
      </div>
    </Card>
  );
};

function RepositoryPage() {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useRepositories();

  const { mutate: connectRepo } = useConnectRepository();

  const [searchQuery, setSearchQuery] = useState("");
  const [localConnectingId, setLocalConnectingId] = useState<number | null>(
    null
  );

  const allRepositories: Repository[] = data?.pages.flat() || [];

  const filteredRepositories = allRepositories.filter(
    (repo: Repository) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRegister = async (repo: Repository) => {
    setLocalConnectingId(repo.id);
    connectRepo(
      {
        owner: repo.full_name.split("/")[0],
        repo: repo.name,
        githubId: repo.id,
      },
      {
        onSettled: () => {
          setLocalConnectingId(null);
        },
      }
    );
  };

  if (isLoading && allRepositories.length === 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 from-white via-blue-50 to-white min-h-screen">
        <div className="space-y-6 mb-8">
          <Skeleton className="h-10 w-80 bg-blue-100 rounded-lg" />
          <Skeleton className="h-5 w-96 bg-blue-100 rounded-md" />
          <Skeleton className="h-14 w-full max-w-2xl rounded-xl bg-blue-100" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <RepositoryCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 from-white via-blue-50 to-white min-h-screen flex items-center justify-center">
        <Card className="max-w-md mx-auto shadow-lg p-8 bg-white border border-blue-100">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <ExternalLink className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">
              Unable to Load Repositories
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Failed to fetch data from GitHub. Please check your connection and
              permissions, then try again.
            </p>
            <Button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full mt-4"
            >
              {isRefetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                "Try Again"
              )}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="space-y-6 mb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">
              Your Repository Manager
            </h1>
            <p className="text-gray-600 text-base">
              Connect your repositories for AI code analysis and reviews.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-blue-600 border-blue-300 hover:bg-blue-50 hover:border-blue-400 whitespace-nowrap bg-white flex items-center"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Syncing..." : "Sync Repos"}
          </Button>
        </div>

        <div className="relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-400" />
          <Input
            placeholder={`Search ${allRepositories.length} repositories...`}
            className="pl-12 pr-4 py-2.5 text-base rounded-lg border border-blue-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all placeholder:text-gray-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Repository Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredRepositories.length > 0 ? (
          filteredRepositories.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repo={repo}
              onRegister={handleRegister}
              connectingId={localConnectingId}
            />
          ))
        ) : (
          <div className="col-span-full text-center py-20">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-10 h-10 text-blue-400" />
            </div>
            <p className="text-xl font-semibold text-gray-900 mb-2">
              {searchQuery ? "No repositories found" : "No repositories yet"}
            </p>
            <p className="text-gray-600 text-sm">
              {searchQuery
                ? `No results for "${searchQuery}". Try a different search.`
                : "Link your GitHub account to get started."}
            </p>
          </div>
        )}
      </div>

      <div className="mt-12 flex justify-center">
        {hasNextPage && (
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More Repos"
            )}
          </Button>
        )}

        {!hasNextPage && allRepositories.length > 0 && (
          <p className="text-sm text-gray-400">All repositories loaded</p>
        )}
      </div>
    </div>
  );
}

export default RepositoryPage;
