"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  ExternalLink,
  FileCode,
  GitPullRequest,
  Info,
  Lightbulb,
  ListTree,
  Loader2,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  applyFindingFix,
  submitFindingFeedback,
  updateFindingStatus,
} from "@/module/review/actions";
import {
  CATEGORY_LABELS,
  countBySeverity,
  getOpenFindings,
  RISK_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  STATUS_LABELS,
  VERDICT_LABELS,
  type FindingSeverity,
  type FindingStatus,
  type ReviewFinding,
  type ReviewInsights,
  type ReviewVerdict,
  type RiskLevel,
} from "@/module/review/lib/insights";

export const SEVERITY_STYLES: Record<
  FindingSeverity,
  { badge: string; dot: string; bar: string }
> = {
  critical: {
    badge: "bg-rose-50 text-rose-700 border-rose-300",
    dot: "bg-rose-500",
    bar: "#f43f5e",
  },
  high: {
    badge: "bg-orange-50 text-orange-700 border-orange-300",
    dot: "bg-orange-500",
    bar: "#f97316",
  },
  medium: {
    badge: "bg-amber-50 text-amber-700 border-amber-300",
    dot: "bg-amber-500",
    bar: "#f59e0b",
  },
  low: {
    badge: "bg-sky-50 text-sky-700 border-sky-300",
    dot: "bg-sky-500",
    bar: "#0ea5e9",
  },
  info: {
    badge: "bg-slate-50 text-slate-600 border-slate-300",
    dot: "bg-slate-400",
    bar: "#94a3b8",
  },
};

export const RISK_STYLES: Record<RiskLevel, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-300",
  moderate: "bg-amber-50 text-amber-700 border-amber-300",
  high: "bg-orange-50 text-orange-700 border-orange-300",
  critical: "bg-rose-50 text-rose-700 border-rose-300",
};

const VERDICT_STYLES: Record<
  ReviewVerdict,
  { badge: string; icon: React.ElementType }
> = {
  approve: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-300",
    icon: CheckCircle2,
  },
  request_changes: {
    badge: "bg-rose-50 text-rose-700 border-rose-300",
    icon: ShieldAlert,
  },
  informational: {
    badge: "bg-slate-50 text-slate-700 border-slate-300",
    icon: Info,
  },
};

const SEVERITY_ICONS: Record<FindingSeverity, React.ElementType> = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: Info,
  info: Info,
};

export function VerdictBadge({ verdict }: { verdict: ReviewVerdict }) {
  const { badge, icon: Icon } = VERDICT_STYLES[verdict];
  return (
    <Badge variant="outline" className={`font-semibold ${badge}`}>
      <Icon className="w-3.5 h-3.5" />
      {VERDICT_LABELS[verdict]}
    </Badge>
  );
}

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  return (
    <Badge variant="outline" className={`font-semibold ${RISK_STYLES[level]}`}>
      {RISK_LABELS[level]}
      {typeof score === "number" && <span className="opacity-70">{score}/100</span>}
    </Badge>
  );
}

export function ScoreRing({
  value,
  label,
  invert = false,
}: {
  value: number;
  label: string;
  invert?: boolean;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const goodness = invert ? 100 - value : value;
  const color = goodness >= 80 ? "#10b981" : goodness >= 60 ? "#f59e0b" : "#f43f5e";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">
          {value}
        </span>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
    </div>
  );
}

function RevisionTrend({ insights }: { insights: ReviewInsights }) {
  if (insights.history.length < 2) return null;

  return (
    <div className="flex items-end gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Risk by revision
        </p>
        <div className="mt-1.5 flex h-10 items-end gap-1.5">
          {insights.history.map((snapshot) => (
            <div key={snapshot.revision} className="flex flex-col items-center gap-0.5">
              <div
                title={`Revision ${snapshot.revision}: risk ${snapshot.riskScore}, ${snapshot.open} open`}
                className="w-3.5 rounded-sm bg-blue-500/80"
                style={{ height: `${Math.max(4, (snapshot.riskScore / 100) * 32)}px` }}
              />
              <span className="text-[9px] text-slate-400">{snapshot.revision}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Walkthrough({ insights }: { insights: ReviewInsights }) {
  const [open, setOpen] = useState(false);
  const walkthrough = insights.walkthrough;

  if (!walkthrough || (walkthrough.files.length === 0 && !walkthrough.diagram)) return null;

  return (
    <div className="border-t border-slate-200 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800"
      >
        <ListTree className="h-3.5 w-3.5" />
        Walkthrough ({walkthrough.files.length} file{walkthrough.files.length === 1 ? "" : "s"})
        <span className="text-[10px] font-normal normal-case text-slate-400">{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {walkthrough.files.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">File</th>
                    <th className="px-3 py-2 font-semibold">Changes</th>
                    <th className="px-3 py-2 font-semibold">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {walkthrough.files.map((file) => (
                    <tr key={file.path}>
                      <td className="px-3 py-2 font-mono text-slate-800">{file.path}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="text-emerald-600">+{file.additions}</span>{" "}
                        <span className="text-rose-600">-{file.deletions}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{file.summary || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {walkthrough.diagram && (
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <div className="border-b border-slate-800 bg-slate-900 px-3 py-1 font-mono text-[11px] text-slate-400">
                mermaid diagram (rendered on the GitHub comment)
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-sky-200">
                {walkthrough.diagram}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  vote,
  canEdit,
  busyKey,
  onChangeStatus,
  onVote,
  onFix,
}: {
  finding: ReviewFinding;
  vote: "up" | "down" | undefined;
  canEdit: boolean;
  busyKey: string | null;
  onChangeStatus: (status: FindingStatus) => void;
  onVote: (vote: "up" | "down") => void;
  onFix: (mode: "pull_request" | "commit") => void;
}) {
  const Icon = SEVERITY_ICONS[finding.severity];
  const closed = finding.status !== "open";
  const busy = busyKey?.startsWith(finding.id) ?? false;
  const canAutoFix = canEdit && !closed && Boolean(finding.fix && finding.original && finding.file && finding.line);

  return (
    <li
      className={`rounded-lg border p-3.5 transition-opacity ${
        closed ? "border-slate-200 bg-slate-50/40 opacity-70" : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`font-semibold ${SEVERITY_STYLES[finding.severity].badge}`}>
          <Icon className="w-3 h-3" />
          {SEVERITY_LABELS[finding.severity]}
        </Badge>
        <Badge variant="outline" className="bg-white text-slate-600 border-slate-200">
          {CATEGORY_LABELS[finding.category]}
        </Badge>
        {finding.source === "scanner" && (
          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
            <ScanSearch className="w-3 h-3" />
            Security scan
          </Badge>
        )}
        {finding.source === "rule" && (
          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
            Rule
          </Badge>
        )}
        {closed && (
          <Badge variant="outline" className="bg-white text-slate-500 border-slate-300">
            {STATUS_LABELS[finding.status]}
          </Badge>
        )}
        {finding.file && (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500">
            <FileCode className="w-3 h-3" />
            {finding.file}
            {finding.line ? `:${finding.line}` : ""}
          </span>
        )}
      </div>

      <p className={`mt-2 text-sm font-semibold text-slate-900 ${closed ? "line-through" : ""}`}>
        {finding.title}
      </p>
      {finding.detail && (
        <p className="mt-0.5 text-sm text-slate-600 leading-relaxed">{finding.detail}</p>
      )}

      {finding.suggestion && (
        <div className="mt-2.5 flex gap-2 rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 text-sm text-slate-700">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>{finding.suggestion}</span>
        </div>
      )}

      {finding.fix && (
        <div className="mt-2.5 overflow-hidden rounded-md border border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 bg-slate-900 px-3 py-1 text-[11px] font-mono text-slate-400">
            Suggested replacement for line {finding.line}
          </div>
          <pre className="overflow-x-auto p-3 text-xs font-mono leading-relaxed text-emerald-300">
            {finding.fix}
          </pre>
        </div>
      )}

      {finding.fixUrl && (
        <a
          href={finding.fixUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
        >
          <GitPullRequest className="h-3.5 w-3.5" />
          Fix pull request opened
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canAutoFix && (
          <>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => onFix("pull_request")}
              className="h-7 gap-1 bg-blue-600 text-xs text-white hover:bg-blue-700"
            >
              {busyKey === `${finding.id}:fix` ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wand2 className="h-3 w-3" />
              )}
              Open fix PR
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onFix("commit")}
              className="h-7 gap-1 text-xs"
              title="Commits the change directly to the pull request branch"
            >
              Commit to branch
            </Button>
          </>
        )}

        {canEdit &&
          (finding.status === "open" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onChangeStatus("resolved")}
                className="h-7 gap-1 border-emerald-200 text-xs text-emerald-700 hover:bg-emerald-50"
              >
                {busyKey === `${finding.id}:status` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Mark resolved
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onChangeStatus("dismissed")}
                className="h-7 gap-1 text-xs text-slate-600"
              >
                <EyeOff className="h-3 w-3" />
                Dismiss
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onChangeStatus("open")}
              className="h-7 gap-1 text-xs text-slate-600"
            >
              <RotateCcw className="h-3 w-3" />
              Reopen
            </Button>
          ))}

        <div className="ml-auto flex items-center gap-1" title="Was this finding useful? Votes teach RepoPilot what to stop flagging.">
          <button
            type="button"
            onClick={() => onVote("up")}
            className={`rounded-md p-1.5 transition-colors ${
              vote === "up" ? "bg-emerald-100 text-emerald-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            }`}
            aria-label="Helpful finding"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onVote("down")}
            className={`rounded-md p-1.5 transition-colors ${
              vote === "down" ? "bg-rose-100 text-rose-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            }`}
            aria-label="Unhelpful finding"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

export function InsightsPanel({
  insights,
  reviewId,
  canEdit = true,
  votes = {},
}: {
  insights: ReviewInsights;
  reviewId?: string;
  canEdit?: boolean;
  // Votes of the current user for this review, keyed by finding id.
  votes?: Record<string, "up" | "down">;
}) {
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | "all">("all");
  const [showClosed, setShowClosed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [localVotes, setLocalVotes] = useState<Record<string, "up" | "down" | null>>({});

  const open = useMemo(() => getOpenFindings(insights), [insights]);
  const counts = useMemo(() => countBySeverity(open), [open]);
  const closedCount = insights.findings.length - open.length;

  const visibleFindings = useMemo(
    () =>
      insights.findings.filter(
        (f) =>
          (showClosed || f.status === "open") &&
          (severityFilter === "all" || f.severity === severityFilter)
      ),
    [insights.findings, severityFilter, showClosed]
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["reviews"] });
    queryClient.invalidateQueries({ queryKey: ["review-insights-overview"] });
  };

  const statusMutation = useMutation({
    mutationFn: async ({ findingId, status }: { findingId: string; status: FindingStatus }) => {
      if (!reviewId) throw new Error("Review is not available");
      setBusyKey(`${findingId}:status`);
      return await updateFindingStatus(reviewId, findingId, status);
    },
    onSuccess: (result) => {
      if (!result.ok) return void toast.error(result.error);
      toast.success("Finding updated");
      refresh();
    },
    onError: () => toast.error("Could not update the finding"),
    onSettled: () => setBusyKey(null),
  });

  const fixMutation = useMutation({
    mutationFn: async ({ findingId, mode }: { findingId: string; mode: "pull_request" | "commit" }) => {
      if (!reviewId) throw new Error("Review is not available");
      setBusyKey(`${findingId}:fix`);
      return await applyFindingFix(reviewId, findingId, mode);
    },
    onSuccess: (result) => {
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.data.mode === "commit" ? "Fix committed to the branch" : "Fix pull request opened", {
        action: { label: "View", onClick: () => window.open(result.data.url, "_blank", "noopener,noreferrer") },
      });
      refresh();
    },
    onError: () => toast.error("Could not apply the fix"),
    onSettled: () => setBusyKey(null),
  });

  const voteMutation = useMutation({
    mutationFn: async ({ findingId, vote }: { findingId: string; vote: "up" | "down" }) => {
      if (!reviewId) throw new Error("Review is not available");
      return await submitFindingFeedback(reviewId, findingId, vote);
    },
    onSuccess: (result, variables) => {
      if (!result.ok) return void toast.error(result.error);
      setLocalVotes((prev) => ({ ...prev, [variables.findingId]: result.data.vote }));
      queryClient.invalidateQueries({ queryKey: ["review-insights-overview"] });
    },
    onError: () => toast.error("Could not save your vote"),
  });

  const editable = canEdit && Boolean(reviewId);

  const currentVote = (findingId: string): "up" | "down" | undefined => {
    if (findingId in localVotes) return localVotes[findingId] ?? undefined;
    return votes[findingId];
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center gap-5 p-4 sm:p-5 bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
        <div className="flex items-center gap-5 shrink-0">
          <ScoreRing value={insights.qualityScore} label="Quality" />
          <ScoreRing value={insights.securityScore} label="Security" />
          <ScoreRing value={insights.riskScore} label="Risk" invert />
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={insights.verdict} />
            <RiskBadge level={insights.riskLevel} />
            {insights.verdict === "request_changes" && (
              <Badge variant="outline" className="bg-white text-slate-600 border-slate-300 font-medium">
                Blocking issues found
              </Badge>
            )}
            {insights.revision > 1 && (
              <Badge variant="outline" className="bg-white text-slate-600 border-slate-300 font-medium">
                Revision {insights.revision}
              </Badge>
            )}
          </div>

          {insights.summary && (
            <p className="text-sm text-slate-700 leading-relaxed">{insights.summary}</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[s].badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_STYLES[s].dot}`} />
                {counts[s]} {SEVERITY_LABELS[s]}
              </span>
            ))}
            {open.length === 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-3 h-3" /> No open issues
              </span>
            )}
          </div>
        </div>

        <RevisionTrend insights={insights} />
      </div>

      {insights.autoResolved.length > 0 && (
        <div className="flex items-start gap-2 border-t border-emerald-100 bg-emerald-50/70 px-4 py-2.5 text-sm text-emerald-800 sm:px-5">
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{insights.autoResolved.length} earlier finding{insights.autoResolved.length === 1 ? "" : "s"} fixed</strong>{" "}
            since the last run: {insights.autoResolved.slice(0, 3).join("; ")}
            {insights.autoResolved.length > 3 ? "…" : ""}
          </span>
        </div>
      )}

      <Walkthrough insights={insights} />

      {insights.findings.length > 0 && (
        <div className="border-t border-slate-200 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Findings ({visibleFindings.length})
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {(["all", ...SEVERITIES.filter((s) => counts[s] > 0)] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverityFilter(s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    severityFilter === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s === "all" ? "All" : SEVERITY_LABELS[s]}
                </button>
              ))}
              {closedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClosed((v) => !v)}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {showClosed ? "Hide" : "Show"} closed ({closedCount})
                </button>
              )}
            </div>
          </div>

          {visibleFindings.length === 0 ? (
            <p className="text-sm text-slate-500">No findings match the current filter.</p>
          ) : (
            <ul className="space-y-2.5">
              {visibleFindings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  canEdit={editable}
                  busyKey={busyKey}
                  vote={currentVote(finding.id)}
                  onChangeStatus={(status) => statusMutation.mutate({ findingId: finding.id, status })}
                  onVote={(vote) => {
                    if (!reviewId) return;
                    voteMutation.mutate({ findingId: finding.id, vote });
                  }}
                  onFix={(mode) => {
                    if (
                      mode === "commit" &&
                      !window.confirm("This commits the change directly to the pull request branch. Continue?")
                    ) {
                      return;
                    }
                    fixMutation.mutate({ findingId: finding.id, mode });
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
