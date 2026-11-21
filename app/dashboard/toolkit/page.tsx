"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, Copy, FileText, FlaskConical, Github, Loader2, Megaphone, Search, ShieldCheck, Sparkles, Upload, Wrench } from "lucide-react";
import { toast } from "sonner";
import MarkdownView from "@/components/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import UsageMeter, { USAGE_QUERY_KEY } from "@/module/billing/components/usage-meter";
import { SEVERITY_STYLES } from "@/module/review/components/insights-panel";
import { SEVERITY_LABELS } from "@/module/review/lib/insights";
import { getAccessibleRepositories } from "@/module/team/actions";
import { hasRole } from "@/module/team/lib/roles";
import {
  applyPullRequestDescription,
  generatePullRequestDescription,
  generateReleaseNotes,
  generateTestsForPullRequest,
  getToolkitPullRequests,
  investigateRepositoryIssue,
  scanPullRequestSecurity,
} from "@/module/toolkit/actions";

const TOOLS = [
  {
    id: "description", label: "PR Description", icon: FileText, needsPr: true,
    help: "Draft a title and summary from the pull request diff.", action: "Draft description", pending: "Drafting description...",
  },
  {
    id: "tests", label: "Unit Tests", icon: FlaskConical, needsPr: true,
    help: "Suggest tests for the changes in a pull request.", action: "Generate tests", pending: "Generating tests...",
  },
  {
    id: "release", label: "Release Notes", icon: Megaphone, needsPr: false,
    help: "Summarize pull requests merged during the selected period.", action: "Generate notes", pending: "Generating release notes...",
  },
  {
    id: "security", label: "Security Scan", icon: ShieldCheck, needsPr: true,
    help: "Check changes for leaked secrets and dependencies with known vulnerabilities.", action: "Run scan", pending: "Scanning changes...",
  },
  {
    id: "issue", label: "Issue Investigation", icon: Search, needsPr: false,
    help: "Analyze a GitHub issue using its discussion and relevant indexed code.", action: "Investigate issue", pending: "Investigating issue...",
  },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];
type RunTarget = { repositoryId: string; value: number };
type Draft = { target: RunTarget; title: string; body: string };

const controlClass = "h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-60 sm:text-sm";
const fieldLabel = "mb-2 block text-sm font-medium text-slate-700";
const resultHeader = "flex flex-col gap-3 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6";

function targetMatches(previous: RunTarget | undefined, current: RunTarget) {
  return previous?.repositoryId === current.repositoryId && previous.value === current.value;
}

function CopyButton({ text }: { text: string }) {
  const [copiedText, setCopiedText] = useState("");
  const copied = copiedText === text && Boolean(text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy. Select the text to copy it manually.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="self-start">
      {copied ? <Check className="text-emerald-600" /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function MarkdownResult({ title, detail, markdown }: { title: string; detail: ReactNode; markdown: string }) {
  return (
    <Card className="gap-4 border-slate-200 bg-white">
      <CardHeader className={resultHeader}>
        <div className="min-w-0 space-y-1.5">
          <CardTitle className="wrap-anywhere text-lg">{title}</CardTitle>
          <CardDescription>{detail}</CardDescription>
        </div>
        <CopyButton text={markdown} />
      </CardHeader>
      <CardContent className="min-w-0 px-4 sm:px-6"><MarkdownView>{markdown}</MarkdownView></CardContent>
    </Card>
  );
}

function ToolkitContent() {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [toolId, setToolId] = useState<ToolId>(() => TOOLS.find(({ id }) => id === params.get("tab"))?.id ?? "description");
  const [repoOverride, setRepoOverride] = useState(params.get("repo") ?? "");
  const [prNumber, setPrNumber] = useState(params.get("pr") ?? "");
  const [issueNumber, setIssueNumber] = useState(params.get("issue") ?? "");
  const [days, setDays] = useState("7");
  const [draft, setDraft] = useState<Draft>();
  const [preview, setPreview] = useState(false);

  const tool = TOOLS.find(({ id }) => id === toolId) ?? TOOLS[0];
  const repositoriesQuery = useQuery({
    queryKey: ["accessible-repositories", "VIEWER"],
    queryFn: () => getAccessibleRepositories("VIEWER"),
    staleTime: 60_000,
  });
  const repositories = repositoriesQuery.data ?? [];
  const repositoryId = repoOverride || repositories[0]?.id || "";
  const repository = repositories.find((item) => item.id === repositoryId);
  const canGenerate = Boolean(repository && hasRole(repository.role, "MEMBER"));
  const pulls = useQuery({
    queryKey: ["toolkit-prs", repositoryId],
    queryFn: async () => {
      const result = await getToolkitPullRequests(repositoryId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: Boolean(repository) && tool.needsPr,
    staleTime: 30_000,
  });

  const refreshUsage = () => void queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY });
  const describe = useMutation({
    mutationFn: ({ repositoryId, value }: RunTarget) => generatePullRequestDescription(repositoryId, value),
    onSettled: refreshUsage,
    onSuccess: (result, target) => {
      if (result.ok) {
        setDraft({ target, ...result.data });
        setPreview(false);
      }
    },
  });
  const tests = useMutation({
    mutationFn: ({ repositoryId, value }: RunTarget) => generateTestsForPullRequest(repositoryId, value),
    onSettled: refreshUsage,
  });
  const release = useMutation({
    mutationFn: ({ repositoryId, value }: RunTarget) => generateReleaseNotes(repositoryId, value),
    onSettled: refreshUsage,
  });
  const scan = useMutation({
    mutationFn: ({ repositoryId, value }: RunTarget) => scanPullRequestSecurity(repositoryId, value),
    onSettled: refreshUsage,
  });
  const investigate = useMutation({
    mutationFn: ({ repositoryId, value }: RunTarget) => investigateRepositoryIssue(repositoryId, value),
    onSettled: refreshUsage,
  });
  const apply = useMutation({
    mutationFn: ({ target, title, body }: Draft) => applyPullRequestDescription(target.repositoryId, target.value, title, body),
    onSuccess: (result, { target }) => {
      if (result.ok) toast.success("Pull request #" + target.value + " updated on GitHub");
      else toast.error(result.error);
    },
    onError: () => toast.error("Could not update the pull request. Please try again."),
  });

  const run = { description: describe, tests, release, security: scan, issue: investigate }[toolId];
  const value = Number(tool.needsPr ? prNumber : toolId === "issue" ? issueNumber : days);
  const target = { repositoryId, value };
  const hasTarget = Number.isSafeInteger(value) && value > 0;
  const currentRun = targetMatches(run.variables, target);
  const currentDraft = draft && targetMatches(draft.target, target) ? draft : undefined;
  const runError = currentRun && (run.error
    ? "Could not complete this request. Please try again."
    : run.data?.ok === false ? run.data.error : null);
  const testsResult = targetMatches(tests.variables, target) && tests.data?.ok ? tests.data.data : null;
  const releaseResult = targetMatches(release.variables, target) && release.data?.ok ? release.data.data : null;
  const issueResult = targetMatches(investigate.variables, target) && investigate.data?.ok ? investigate.data.data : null;
  const scanResult = targetMatches(scan.variables, target) && scan.data?.ok ? scan.data.data : null;
  const runDisabled = run.isPending || !repository || !hasTarget || (toolId !== "security" && !canGenerate);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Wrench className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">AI Toolkit</h1>
            <p className="mt-1 text-sm text-slate-600">Tools for pull requests, releases, and GitHub issues.</p>
          </div>
        </div>
        <UsageMeter compact kind="toolkit" />
      </div>

      <div role="group" aria-label="Toolkit tools" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={toolId === item.id}
            onClick={() => setToolId(item.id)}
            className="flex min-h-14 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold leading-snug text-slate-700 shadow-xs transition-colors hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-pressed:border-blue-400 aria-pressed:bg-blue-50 aria-pressed:text-blue-800"
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>

      <Card className="@container gap-4 border-slate-200 bg-white">
        <CardHeader className="gap-1 px-4 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-900">{tool.label}</h2>
          <CardDescription className="text-slate-600">{tool.help}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 sm:px-6">
          {repositoriesQuery.isError ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700" role="alert">
              Repositories could not be loaded.
              <Button type="button" variant="outline" size="sm" onClick={() => void repositoriesQuery.refetch()}>Retry</Button>
            </div>
          ) : !repositoriesQuery.isPending && repositories.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              Connect a repository to use this tool.
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/repositories"><Github /> Connect repository</Link>
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!runDisabled) run.mutate(target);
              }}
              className="grid min-w-0 gap-4 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @2xl:items-end"
            >
              <div className="min-w-0">
                <label htmlFor="toolkit-repository" className={fieldLabel}>Repository</label>
                <select
                  id="toolkit-repository"
                  value={repositoryId}
                  disabled={repositoriesQuery.isPending}
                  onChange={(event) => {
                    setRepoOverride(event.target.value);
                    setPrNumber("");
                    setIssueNumber("");
                  }}
                  className={controlClass}
                >
                  {!repository && <option value={repositoryId}>{repositoriesQuery.isPending ? "Loading repositories..." : "Select a repository"}</option>}
                  {repositories.map(({ id, fullName }) => <option key={id} value={id}>{fullName}</option>)}
                </select>
              </div>

              {tool.needsPr ? (
                <div className="min-w-0">
                  <label htmlFor="toolkit-pr" className={fieldLabel}>Pull request</label>
                  <select
                    id="toolkit-pr"
                    value={hasTarget ? prNumber : ""}
                    onChange={(event) => setPrNumber(event.target.value)}
                    disabled={!repository || pulls.isLoading}
                    className={controlClass}
                  >
                    <option value="">{pulls.isLoading ? "Loading pull requests..." : pulls.data?.length ? "Select a pull request" : "No pull requests available"}</option>
                    {hasTarget && !pulls.data?.some((pr) => String(pr.number) === prNumber) && <option value={prNumber}>Pull request #{value}</option>}
                    {pulls.data?.map((pr) => (
                      <option key={pr.number} value={pr.number}>#{pr.number} {pr.title} ({pr.state})</option>
                    ))}
                  </select>
                </div>
              ) : toolId === "issue" ? (
                <div className="min-w-0">
                  <label htmlFor="toolkit-issue" className={fieldLabel}>GitHub issue number</label>
                  <Input id="toolkit-issue" type="number" min={1} step={1} placeholder="128" value={issueNumber} onChange={(event) => setIssueNumber(event.target.value)} className={controlClass} />
                </div>
              ) : (
                <div className="min-w-0">
                  <label htmlFor="toolkit-period" className={fieldLabel}>Period</label>
                  <select id="toolkit-period" value={days} onChange={(event) => setDays(event.target.value)} className={controlClass}>
                    {[7, 14, 30, 60].map((period) => <option value={period} key={period}>Last {period} days</option>)}
                  </select>
                </div>
              )}

              <Button type="submit" disabled={runDisabled} className="h-11 w-full rounded-lg bg-blue-600 text-white hover:bg-blue-700 @lg:col-span-2 @2xl:col-span-1 @2xl:w-auto">
                {run.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {run.isPending ? tool.pending : tool.action}
              </Button>
            </form>
          )}

          {tool.needsPr && repository && pulls.isError && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700" role="alert">
              Pull requests could not be loaded.
              <Button type="button" variant="outline" size="sm" onClick={() => void pulls.refetch()}>Retry</Button>
            </div>
          )}
          {repository && toolId !== "security" && !canGenerate && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              This repository requires member access to run this tool.
            </p>
          )}
          {runError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">{runError}</p>}
          <p role="status" className="sr-only">
            {run.isPending ? tool.pending : currentRun && run.data?.ok ? "Result ready." : ""}
          </p>
        </CardContent>
      </Card>

      {toolId === "description" && currentDraft && repository && (
        <Card className="gap-4 border-slate-200 bg-white">
          <CardHeader className={resultHeader}>
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="text-lg">Generated description</CardTitle>
              <CardDescription className="wrap-anywhere">{repository.fullName} &middot; PR #{currentDraft.target.value}</CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <CopyButton text={currentDraft.title + "\n\n" + currentDraft.body} />
              <Button
                size="sm"
                onClick={() => apply.mutate(currentDraft)}
                disabled={apply.isPending || describe.isPending || !currentDraft.title.trim() || !canGenerate}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {apply.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                Apply to PR #{currentDraft.target.value}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4 px-4 sm:px-6">
            <div>
              <label htmlFor="toolkit-title" className={fieldLabel}>Title</label>
              <Input id="toolkit-title" maxLength={256} value={currentDraft.title} onChange={(event) => setDraft({ ...currentDraft, title: event.target.value })} className="h-10 font-semibold" />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={preview ? undefined : "toolkit-description"} className="text-sm font-medium text-slate-700">Description</label>
                <div role="group" aria-label="Description view" className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  {[false, true].map((mode) => (
                    <button key={String(mode)} type="button" aria-pressed={preview === mode} onClick={() => setPreview(mode)} className="cursor-pointer rounded-md px-3 py-1 text-xs font-semibold text-slate-600 aria-pressed:bg-white aria-pressed:text-blue-700 aria-pressed:shadow-xs">
                      {mode ? "Preview" : "Edit"}
                    </button>
                  ))}
                </div>
              </div>
              {preview ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <MarkdownView>{currentDraft.body}</MarkdownView>
                </div>
              ) : (
                <textarea id="toolkit-description" rows={12} value={currentDraft.body} onChange={(event) => setDraft({ ...currentDraft, body: event.target.value })} className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-blue-500" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {toolId === "tests" && testsResult && (
        <MarkdownResult title="Suggested tests" detail="Review imports and assumptions before committing these tests." markdown={testsResult.markdown} />
      )}
      {toolId === "release" && releaseResult && (
        <MarkdownResult title="Release notes" detail={releaseResult.prCount + " merged pull request" + (releaseResult.prCount === 1 ? "" : "s")} markdown={releaseResult.markdown} />
      )}
      {toolId === "issue" && issueResult && (
        <MarkdownResult title={issueResult.title} markdown={issueResult.markdown} detail={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {issueResult.usedAgent ? "OpenAI issue agent" : "AI investigation"}
            <a href={issueResult.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-700 underline underline-offset-2">
              GitHub issue #{value} <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </span>
        } />
      )}

      {toolId === "security" && scanResult && (
        <Card className="gap-4 border-slate-200 bg-white">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="wrap-anywhere text-lg">Scan results for {scanResult.prTitle}</CardTitle>
            <CardDescription>
              {scanResult.filesScanned} file{scanResult.filesScanned === 1 ? "" : "s"} scanned and{" "}
              {scanResult.dependenciesChecked} dependenc{scanResult.dependenciesChecked === 1 ? "y" : "ies"} checked.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3 px-4 sm:px-6">
            {scanResult.findings.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" /> No leaked secrets or vulnerable dependencies found in this change.
              </div>
            ) : (
              scanResult.findings.map((finding, index) => (
                <div key={finding.title + index} className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={SEVERITY_STYLES[finding.severity].badge}>{SEVERITY_LABELS[finding.severity]}</Badge>
                    {finding.file && <span className="wrap-anywhere font-mono text-xs text-slate-600">{finding.file}{finding.line ? ":" + finding.line : ""}</span>}
                  </div>
                  <p className="mt-2 wrap-anywhere text-sm font-semibold text-slate-900">{finding.title}</p>
                  <p className="mt-0.5 wrap-anywhere text-sm text-slate-600">{finding.detail}</p>
                  {finding.suggestion && <p className="mt-1.5 wrap-anywhere text-sm text-blue-700">{finding.suggestion}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ToolkitPage() {
  return (
    <Suspense fallback={<div className="flex min-h-60 items-center justify-center" role="status"><Loader2 className="size-6 animate-spin text-blue-600" /><span className="sr-only">Loading toolkit</span></div>}>
      <ToolkitContent />
    </Suspense>
  );
}
