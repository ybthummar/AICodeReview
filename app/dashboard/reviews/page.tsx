"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  PlayCircle,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getReviews, triggerManualReview } from "@/module/review/actions";
import { getConnectedRepositories } from "@/module/settings/actions";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { Review, ReviewCardProps } from "@/types/review/types";

const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusConfig = {
    completed: {
      icon: CheckCircle2,
      color:
        "bg-white text-green-600 border-green-500 hover:text-green-700 hover:border-green-600",
      text: "Completed",
    },
    pending: {
      icon: Loader2,
      color:
        "bg-amber-50 text-amber-700 border-amber-300 animate-pulse hover:text-amber-800",
      text: "In Progress",
    },
    failed: {
      icon: XCircle,
      color:
        "bg-white text-red-500 border-red-500 hover:text-red-600 hover:border-red-600",
      text: "Failed",
    },
    default: {
      icon: Clock,
      color:
        "bg-white text-gray-500 border-gray-500 hover:text-gray-600 hover:border-gray-600",
      text: review.status,
    },
  };

  const config =
    statusConfig[review.status as keyof typeof statusConfig] ||
    statusConfig.default;
  const Icon = config.icon;

  const timeAgo = formatDistanceToNow(new Date(review.createdAt), {
    addSuffix: true,
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(review.review);
    setCopied(true);
    toast.success("Review copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="shadow-md transition-all duration-300 hover:shadow-xl hover:border-blue-300 border border-gray-200 bg-white">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <CardTitle className="text-lg md:text-xl font-bold text-gray-900 pr-4">
            <h2>
              {review.prTitle} <span className="text-blue-600 font-semibold">@{review.repository.fullName}</span>
            </h2>
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={`font-semibold flex items-center ${config.color}`}
            >
              <Icon className={`w-3.5 h-3.5 mr-1 ${review.status === "pending" ? "animate-spin" : ""}`} />
              {config.text}
            </Badge>

            <Badge
              className={`font-semibold flex items-center bg-white text-gray-600 border-gray-300`}
            >
              <Clock className="w-3.5 h-3.5 mr-1" />
              Reviewed {timeAgo}
            </Badge>

            <Badge
              className={`font-semibold bg-white text-blue-600 border-blue-400 hover:bg-blue-50`}
            >
              <a
                href={review.prUrl}
                className="flex items-center gap-x-1.5"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                PR #{review.prNumber}
              </a>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-6 pt-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" /> AI Review Report
          </span>
          {review.status === "completed" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2.5 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-green-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Markdown</span>
                </>
              )}
            </Button>
          )}
        </div>

        {/* Dynamic review body */}
        {review.status === "pending" ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3 bg-blue-50/50 rounded-xl border border-blue-100 p-6">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <div>
              <p className="font-semibold text-slate-800 text-base">AI Code Review in Progress</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Analyzing pull request diff, querying Pinecone RAG symbol embeddings, and generating structured code recommendations...
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`relative rounded-xl border border-gray-200 bg-slate-50/70 p-5 transition-all ${
              !isExpanded ? "max-h-96 overflow-hidden" : ""
            }`}
          >
            <div className="prose prose-slate max-w-none text-sm leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2 pb-1.5 border-b border-gray-200">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-200 flex items-center gap-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold text-gray-900 mt-3 mb-1.5">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-sm font-semibold text-gray-800 mt-2.5 mb-1">
                      {children}
                    </h4>
                  ),
                  p: ({ children }) => (
                    <p className="text-gray-700 leading-relaxed text-sm mb-3">
                      {children}
                    </p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-900">
                      {children}
                    </strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-5 space-y-1.5 my-3 text-gray-700 text-sm">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-5 space-y-1.5 my-3 text-gray-700 text-sm">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed">{children}</li>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-blue-500 bg-blue-50/70 p-3 my-3 rounded-r text-sm text-gray-700 italic">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-4 border-gray-200" />,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <div className="relative my-3 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 text-xs text-slate-400 font-mono border-b border-slate-800">
                          <span>{match[1]}</span>
                        </div>
                        <pre className="p-3 text-xs sm:text-sm font-mono text-slate-100 overflow-x-auto leading-relaxed">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    ) : (
                      <code
                        className="bg-slate-200/80 text-blue-800 px-1.5 py-0.5 rounded text-xs font-mono font-medium"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {review.review}
              </ReactMarkdown>
            </div>

            {/* Gradient Fade overlay when collapsed */}
            {!isExpanded && (
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-100 via-slate-100/70 to-transparent pointer-events-none rounded-b-xl" />
            )}
          </div>
        )}

        {/* Show More / Show Less Toggle Button */}
        {review.status !== "pending" && (
          <div className="mt-3 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 flex items-center gap-1.5"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> Expand Full Review
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");
  const [prNumberInput, setPrNumberInput] = useState("");
  const [isTriggering, setIsTriggering] = useState(false);

  const { data: reviews, isLoading, refetch } = useQuery<Review[] | null>({
    queryKey: ["reviews"],
    queryFn: async () => {
      return await getReviews();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasPending = data?.some((r) => r.status === "pending");
      return hasPending ? 3000 : false;
    },
  });

  const { data: repos } = useQuery({
    queryKey: ["connected-repositories-for-review"],
    queryFn: async () => {
      return await getConnectedRepositories();
    },
  });

  const reviewsArray = reviews || [];
  const isEmpty = !isLoading && reviewsArray.length === 0;

  const handleManualReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepoFullName || !prNumberInput) {
      toast.error("Please select a repository and enter a PR number");
      return;
    }

    const [owner, repo] = selectedRepoFullName.split("/");
    const prNum = parseInt(prNumberInput.trim(), 10);

    if (isNaN(prNum) || prNum <= 0) {
      toast.error("Please enter a valid PR number");
      return;
    }

    setIsTriggering(true);
    try {
      toast.info(`Reviewing ${owner}/${repo}#${prNum} with AI & RAG...`);
      await triggerManualReview(owner, repo, prNum);
      toast.success(`Review completed for PR #${prNum}!`);
      setDialogOpen(false);
      setPrNumberInput("");
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to run review");
    } finally {
      setIsTriggering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-blue-600" />
        <span className="text-lg">Loading AI reviews...</span>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-6 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
            AI Code Review History
          </h1>
          <p className="text-gray-600">
            See all automated pull request analyses performed by the AI Code Reviewer.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="flex items-center gap-2 border-gray-300"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 font-semibold">
                <Sparkles className="w-4 h-4" /> Review a Pull Request
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-md bg-white">
              <form onSubmit={handleManualReview}>
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <PlayCircle className="w-5 h-5 text-blue-600" /> Run AI Review on PR
                  </DialogTitle>
                  <DialogDescription>
                    Select a connected repository and specify the pull request number. The AI will pull the diff, query RAG symbols, post a GitHub comment, and show the results here.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Select Repository
                    </label>
                    <select
                      value={selectedRepoFullName}
                      onChange={(e) => setSelectedRepoFullName(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    >
                      <option value="">-- Choose a connected repository --</option>
                      {repos?.map((r) => (
                        <option key={r.id} value={r.fullName}>
                          {r.fullName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Pull Request Number
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g. 1, 2, 3"
                      min="1"
                      value={prNumberInput}
                      onChange={(e) => setPrNumberInput(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <DialogFooter className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={isTriggering}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    disabled={isTriggering}
                  >
                    {isTriggering ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing & Reviewing...
                      </>
                    ) : (
                      "Start AI Review"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isEmpty ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
          <Sparkles className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            No AI Reviews Yet
          </h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6 text-sm">
            When a Pull Request is opened or updated on a connected repository, or when you click &quot;Review a Pull Request&quot;, the AI analysis will appear here.
          </p>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            Run Your First PR Review
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {reviewsArray.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
