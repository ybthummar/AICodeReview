"use client";

import { useState, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { isAdminUser } from "@/lib/admin";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  GitPullRequest,
  GitBranch,
  Github,
  Search,
  Filter,
  FileCode,
  ArrowRight,
  Zap,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getReviews,
  getConnectedReposPullRequests,
  getRepoPullRequests,
  triggerManualReview,
  type ConnectedRepoPR,
} from "@/module/review/actions";
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
        "bg-emerald-50 text-emerald-700 border-emerald-300 hover:text-emerald-800",
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
        "bg-rose-50 text-rose-700 border-rose-300 hover:text-rose-800",
      text: "Failed",
    },
    default: {
      icon: Clock,
      color:
        "bg-slate-50 text-slate-700 border-slate-300 hover:text-slate-800",
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
    <Card
      id={`review-${review.id}`}
      className="shadow-sm transition-all duration-300 hover:shadow-md hover:border-blue-300 border border-slate-200/90 bg-white"
    >
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-200 flex items-center gap-1 font-mono">
                <Github className="w-3 h-3 text-slate-600" />
                {review.repository.fullName}
              </Badge>
              <Badge variant="secondary" className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                PR #{review.prNumber}
              </Badge>
            </div>
            <CardTitle className="text-lg md:text-xl font-bold text-slate-900 pt-1">
              {review.prTitle}
            </CardTitle>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`font-semibold flex items-center ${config.color}`}>
              <Icon className={`w-3.5 h-3.5 mr-1 ${review.status === "pending" ? "animate-spin" : ""}`} />
              {config.text}
            </Badge>

            <Badge variant="outline" className="text-slate-600 border-slate-200 bg-white flex items-center">
              <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />
              Reviewed {timeAgo}
            </Badge>

            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-7 text-xs text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <a
                href={review.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-6 pt-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" /> AI Review Findings
          </span>
          {review.status === "completed" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copied</span>
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
            className={`relative rounded-xl border border-slate-200 bg-slate-50/60 p-5 transition-all ${
              !isExpanded ? "max-h-96 overflow-hidden" : ""
            }`}
          >
            <div className="prose prose-slate max-w-none text-sm leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-xl font-bold text-slate-900 mt-4 mb-2 pb-1.5 border-b border-slate-200">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-200 flex items-center gap-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold text-slate-900 mt-3 mb-1.5">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-sm font-semibold text-slate-800 mt-2.5 mb-1">
                      {children}
                    </h4>
                  ),
                  p: ({ children }) => (
                    <p className="text-slate-700 leading-relaxed text-sm mb-3">
                      {children}
                    </p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-slate-900">
                      {children}
                    </strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-5 space-y-1.5 my-3 text-slate-700 text-sm">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-5 space-y-1.5 my-3 text-slate-700 text-sm">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed">{children}</li>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-blue-500 bg-blue-50/70 p-3 my-3 rounded-r text-sm text-slate-700 italic">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-4 border-slate-200" />,
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
  const { data: session } = useSession();
  const isAdmin = isAdminUser(session?.user);
  const [adminScope, setAdminScope] = useState<"mine" | "all">("mine");
  const [activeTab, setActiveTab] = useState<"prs" | "reports">("prs");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepoFilter, setSelectedRepoFilter] = useState<string>("all");

  // Manual Review Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");
  const [selectedPRNumber, setSelectedPRNumber] = useState("");
  const [customPRNumber, setCustomPRNumber] = useState("");
  const [isTriggering, setIsTriggering] = useState(false);

  // Per-PR review loading state
  const [runningPRId, setRunningPRId] = useState<string | null>(null);

  // 1. Fetch live Pull Requests from connected repositories (strictly user-wise by default)
  const {
    data: pullRequests,
    isLoading: isLoadingPRs,
    refetch: refetchPRs,
    isRefetching: isRefetchingPRs,
  } = useQuery<ConnectedRepoPR[]>({
    queryKey: ["connected-repos-prs", adminScope],
    queryFn: async () => {
      return await getConnectedReposPullRequests(adminScope);
    },
    staleTime: 1000 * 30, // 30s
  });

  // 2. Fetch completed/pending review reports from database (strictly user-wise by default)
  const {
    data: reviews,
    isLoading: isLoadingReviews,
    refetch: refetchReviews,
    isRefetching: isRefetchingReviews,
  } = useQuery<Review[] | null>({
    queryKey: ["reviews", adminScope],
    queryFn: async () => {
      return await getReviews(adminScope);
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasPending = data?.some((r) => r.status === "pending");
      return hasPending ? 3000 : false;
    },
  });

  // 3. Fetch connected repos for the modal dropdown
  const { data: repos } = useQuery({
    queryKey: ["connected-repositories-for-review"],
    queryFn: async () => {
      return await getConnectedRepositories();
    },
  });

  // 4. Fetch PRs dynamically for the selected repository inside the modal
  const { data: modalRepoPRs, isLoading: isLoadingModalPRs } = useQuery({
    queryKey: ["modal-repo-prs", selectedRepoFullName],
    queryFn: async () => {
      if (!selectedRepoFullName) return [];
      const [owner, repo] = selectedRepoFullName.split("/");
      return await getRepoPullRequests(owner, repo);
    },
    enabled: !!selectedRepoFullName,
  });

  const prList = useMemo(() => pullRequests || [], [pullRequests]);
  const reviewList = useMemo(() => reviews || [], [reviews]);

  // Count open PRs needing review
  const openNeedsReviewCount = useMemo(() => {
    return prList.filter((pr) => pr.state === "open" && !pr.hasReview).length;
  }, [prList]);

  // Unique repo list for filtering
  const uniqueRepos = useMemo(() => {
    const set = new Set<string>();
    prList.forEach((pr) => set.add(pr.repoFullName));
    reviewList.forEach((r) => set.add(r.repository.fullName));
    return Array.from(set);
  }, [prList, reviewList]);

  // Filtered PRs
  const filteredPRs = useMemo(() => {
    return prList.filter((pr) => {
      const matchesRepo =
        selectedRepoFilter === "all" || pr.repoFullName === selectedRepoFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        pr.title.toLowerCase().includes(q) ||
        pr.author.toLowerCase().includes(q) ||
        pr.repoFullName.toLowerCase().includes(q) ||
        pr.headRef.toLowerCase().includes(q) ||
        `#${pr.number}`.includes(q);
      return matchesRepo && matchesSearch;
    });
  }, [prList, selectedRepoFilter, searchQuery]);

  // Filtered Reviews
  const filteredReviews = useMemo(() => {
    return reviewList.filter((r) => {
      const matchesRepo =
        selectedRepoFilter === "all" ||
        r.repository.fullName === selectedRepoFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        r.prTitle.toLowerCase().includes(q) ||
        r.repository.fullName.toLowerCase().includes(q) ||
        `#${r.prNumber}`.includes(q);
      return matchesRepo && matchesSearch;
    });
  }, [reviewList, selectedRepoFilter, searchQuery]);

  // Refresh both PRs and Reviews
  const handleRefreshAll = async () => {
    toast.info("Syncing latest Pull Requests and AI reviews...");
    await Promise.all([refetchPRs(), refetchReviews()]);
    toast.success("Synced successfully!");
  };

  // Run AI review for a specific PR
  const handleRunReview = async (
    owner: string,
    repo: string,
    prNumber: number
  ) => {
    const key = `${owner}/${repo}#${prNumber}`;
    setRunningPRId(key);
    try {
      toast.info(`Analyzing ${owner}/${repo}#${prNumber} with AI & RAG...`, {
        description: "Pulling diff, matching code symbols, and generating structured feedback.",
      });

      await triggerManualReview(owner, repo, prNumber);

      toast.success(`AI Review completed for ${owner}/${repo}#${prNumber}!`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["connected-repos-prs"] }),
      ]);
      setActiveTab("reports");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to run AI review"
      );
    } finally {
      setRunningPRId(null);
    }
  };

  // Manual Review Dialog submission
  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepoFullName) {
      toast.error("Please select a repository");
      return;
    }

    const prNum = parseInt(customPRNumber || selectedPRNumber, 10);
    if (isNaN(prNum) || prNum <= 0) {
      toast.error("Please select or enter a valid PR number");
      return;
    }

    const [owner, repo] = selectedRepoFullName.split("/");

    setIsTriggering(true);
    try {
      toast.info(`Reviewing ${owner}/${repo}#${prNum} with AI & RAG...`);
      await triggerManualReview(owner, repo, prNum);
      toast.success(`Review completed for PR #${prNum}!`);
      setDialogOpen(false);
      setSelectedRepoFullName("");
      setSelectedPRNumber("");
      setCustomPRNumber("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["connected-repos-prs"] }),
      ]);
      setActiveTab("reports");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to run review");
    } finally {
      setIsTriggering(false);
    }
  };

  const isSyncing = isRefetchingPRs || isRefetchingReviews;

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-1 flex items-center gap-2">
            AI Code Reviews & Pull Requests
          </h1>
          <p className="text-slate-600 text-sm">
            Inspect live pull requests, launch high-speed AI code reviews on any PR, and explore automated review reports.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isSyncing}
            className="flex items-center gap-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw className={`w-4 h-4 text-blue-600 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync GitHub PRs"}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 font-semibold shadow-sm">
                <Sparkles className="w-4 h-4" /> Run AI Review
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-md bg-white">
              <form onSubmit={handleModalSubmit}>
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
                    <PlayCircle className="w-5 h-5 text-blue-600" /> Run AI Review on Any PR
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Select a connected repository. We will automatically fetch all available pull requests, pull the code diff, retrieve symbol context, and produce a structured review.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                      Select Repository
                    </label>
                    <select
                      value={selectedRepoFullName}
                      onChange={(e) => {
                        setSelectedRepoFullName(e.target.value);
                        setSelectedPRNumber("");
                      }}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

                  {selectedRepoFullName && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Choose Pull Request
                        </label>
                        {isLoadingModalPRs && (
                          <span className="text-xs text-blue-600 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Fetching PRs...
                          </span>
                        )}
                      </div>

                      {modalRepoPRs && modalRepoPRs.length > 0 ? (
                        <select
                          value={selectedPRNumber}
                          onChange={(e) => {
                            setSelectedPRNumber(e.target.value);
                            setCustomPRNumber("");
                          }}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">-- Pick from {modalRepoPRs.length} pull requests --</option>
                          {modalRepoPRs.map((pr) => (
                            <option key={pr.id} value={pr.number}>
                              #{pr.number}: {pr.title} ({pr.state})
                            </option>
                          ))}
                        </select>
                      ) : (
                        !isLoadingModalPRs && (
                          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                            No pull requests returned from GitHub API for this repository. You can manually enter a PR number below.
                          </div>
                        )
                      )}

                      <div className="mt-3">
                        <label className="block text-xs text-slate-500 mb-1">
                          Or type PR Number directly:
                        </label>
                        <Input
                          type="number"
                          placeholder="e.g. 1, 2, 3"
                          min="1"
                          value={customPRNumber}
                          onChange={(e) => {
                            setCustomPRNumber(e.target.value);
                            setSelectedPRNumber("");
                          }}
                        />
                      </div>
                    </div>
                  )}
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
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2"
                    disabled={isTriggering || (!selectedPRNumber && !customPRNumber)}
                  >
                    {isTriggering ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Analyzing with Gemini...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" /> Start AI Review
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs & Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
        {/* Navigation Pills */}
        <div className="flex items-center gap-2 p-1 bg-slate-200/70 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("prs")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === "prs"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <GitPullRequest className="w-4 h-4" />
            Pull Requests
            <Badge
              variant="secondary"
              className={`text-xs ml-1 ${
                activeTab === "prs"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-300/80 text-slate-700"
              }`}
            >
              {prList.length}
            </Badge>
            {openNeedsReviewCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title={`${openNeedsReviewCount} PRs need review`} />
            )}
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === "reports"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Review Reports
            <Badge
              variant="secondary"
              className={`text-xs ml-1 ${
                activeTab === "reports"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-300/80 text-slate-700"
              }`}
            >
              {reviewList.length}
            </Badge>
          </button>
        </div>

        {/* Admin User-Wise vs All-Repositories Scope Toggle */}
        {isAdmin && (
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setAdminScope("mine")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                adminScope === "mine"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              My Reviews
            </button>
            <button
              onClick={() => setAdminScope("all")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                adminScope === "all"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Workspace Reviews (Admin)
            </button>
          </div>
        )}
        </div>

        {/* Search & Repository Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {uniqueRepos.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedRepoFilter}
                onChange={(e) => setSelectedRepoFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="all">All Repositories ({uniqueRepos.length})</option>
                {uniqueRepos.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={activeTab === "prs" ? "Filter PRs by title, author..." : "Filter reviews..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 h-9 text-xs bg-white rounded-lg border-slate-200 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* TAB 1: PULL REQUESTS */}
      {activeTab === "prs" && (
        <div className="space-y-4">
          {isLoadingPRs ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Fetching pull requests from connected GitHub repositories...</p>
            </div>
          ) : filteredPRs.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-2 border-slate-200 bg-white/70">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                <GitPullRequest className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                {searchQuery || selectedRepoFilter !== "all"
                  ? "No matching pull requests found"
                  : "No pull requests found"}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
                Connect your repositories or create a pull request on GitHub. You can also run an AI review manually by entering a PR number.
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshAll}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Sync Repositories
                </Button>
                <Button
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Review PR Manually
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredPRs.map((pr) => {
                const isPRRunning = runningPRId === `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
                const timeAgo = formatDistanceToNow(new Date(pr.createdAt), { addSuffix: true });

                return (
                  <Card
                    key={`${pr.repoFullName}-${pr.number}`}
                    className="shadow-sm border border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-md transition-all p-5"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: PR Information */}
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs bg-slate-50 text-slate-700 border-slate-200 flex items-center gap-1 font-mono"
                          >
                            <Github className="w-3 h-3 text-slate-600" />
                            {pr.repoFullName}
                          </Badge>

                          <Badge
                            className={`text-xs font-semibold ${
                              pr.state === "open"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                                : "bg-purple-50 text-purple-700 border border-purple-300"
                            }`}
                          >
                            <GitPullRequest className="w-3 h-3 mr-1" />
                            {pr.state.toUpperCase()}
                          </Badge>

                          {pr.hasReview ? (
                            <Badge className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Reviewed
                            </Badge>
                          ) : (
                            <Badge className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              Needs Review
                            </Badge>
                          )}
                        </div>

                        {/* PR Title & Number */}
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900 line-clamp-1 hover:text-blue-600 transition-colors">
                            <a
                              href={pr.htmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline flex items-center gap-1.5"
                            >
                              <span>#{pr.number}</span>
                              <span>{pr.title}</span>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400 inline" />
                            </a>
                          </h3>
                        </div>

                        {/* Meta: Author, Branch, Time */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <Avatar className="w-4 h-4">
                              <AvatarImage src={pr.authorAvatar} />
                              <AvatarFallback>{pr.author[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-slate-700">{pr.author}</span>
                          </div>

                          <div className="flex items-center gap-1 font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            <GitBranch className="w-3 h-3 text-blue-600" />
                            <span>{pr.headRef}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                            <span>{pr.baseRef}</span>
                          </div>

                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            Opened {timeAgo}
                          </span>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-start lg:self-center">
                        {pr.hasReview ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setActiveTab("reports");
                                setSearchQuery(`#${pr.number}`);
                              }}
                              className="text-xs h-8 text-blue-600 border-blue-200 hover:bg-blue-50 font-medium"
                            >
                              <FileCode className="w-3.5 h-3.5 mr-1" />
                              View AI Report
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRunReview(pr.repoOwner, pr.repoName, pr.number)}
                              disabled={isPRRunning}
                              className="text-xs h-8 text-slate-600 hover:text-slate-900"
                              title="Re-run AI Review"
                            >
                              {isPRRunning ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                              )}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleRunReview(pr.repoOwner, pr.repoName, pr.number)}
                            disabled={isPRRunning}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 font-semibold shadow-sm flex items-center gap-1.5"
                          >
                            {isPRRunning ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Reviewing...</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                                <span>Run AI Review</span>
                              </>
                            )}
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          className="h-8 w-8 text-slate-500 hover:text-slate-900"
                          title="Open Pull Request in GitHub"
                        >
                          <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REVIEW REPORTS */}
      {activeTab === "reports" && (
        <div>
          {isLoadingReviews ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Loading AI code review reports...</p>
            </div>
          ) : filteredReviews.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-2 border-slate-200 bg-white/70">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                <FileCode className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                {searchQuery || selectedRepoFilter !== "all"
                  ? "No matching AI reviews found"
                  : "No AI code reviews generated yet"}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
                Run an AI code review on any pull request from the Pull Requests tab or enter a PR number manually.
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  size="sm"
                  onClick={() => setActiveTab("prs")}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
                >
                  <GitPullRequest className="w-3.5 h-3.5" /> View Open Pull Requests
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              {filteredReviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
