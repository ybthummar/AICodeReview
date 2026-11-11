"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Copy,
  FileText,
  FlaskConical,
  Loader2,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MarkdownView from "@/components/markdown-view";
import UsageMeter, { USAGE_QUERY_KEY } from "@/module/billing/components/usage-meter";
import { SEVERITY_STYLES } from "@/module/review/components/insights-panel";
import { SEVERITY_LABELS } from "@/module/review/lib/insights";
import { getAccessibleRepositories } from "@/module/team/actions";
import {
  applyPullRequestDescription,
  generatePullRequestDescription,
  generateReleaseNotes,
  generateTestsForPullRequest,
  getToolkitPullRequests,
  scanPullRequestSecurity,
} from "@/module/toolkit/actions";
import { hasRole } from "@/module/team/lib/roles";

type TabId = "description" | "tests" | "release" | "security";

const TABS: { id: TabId; label: string; icon: React.ElementType; needsPr: boolean }[] = [
  { id: "description", label: "PR Description", icon: FileText, needsPr: true },
  { id: "tests", label: "Test Generator", icon: FlaskConical, needsPr: true },
  { id: "release", label: "Release Notes", icon: Megaphone, needsPr: false },
  { id: "security", label: "Security Scan", icon: ShieldCheck, needsPr: true },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      }}
      className="h-8 gap-1.5 text-xs"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function ToolkitContent() {
  const params = useSearchParams();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabId>(
    (TABS.find((t) => t.id === params.get("tab"))?.id as TabId | undefined) ?? "description"
  );
  const [repoOverride, setRepoOverride] = useState(params.get("repo") ?? "");
  const [prNumber, setPrNumber] = useState(params.get("pr") ?? "");
  const [days, setDays] = useState("7");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [previewBody, setPreviewBody] = useState(false);
  const [testsMarkdown, setTestsMarkdown] = useState("");
  const [releaseMarkdown, setReleaseMarkdown] = useState("");
  const [releaseCount, setReleaseCount] = useState<number | null>(null);

  const { data: repositories } = useQuery({
    queryKey: ["accessible-repositories", "VIEWER"],
    queryFn: async () => await getAccessibleRepositories("VIEWER"),
    staleTime: 1000 * 60,
  });

  const repositoryId = repoOverride || repositories?.[0]?.id || "";

  const repository = useMemo(
    () => repositories?.find((r) => r.id === repositoryId),
    [repositories, repositoryId]
  );
  const canGenerate = repository ? hasRole(repository.role, "MEMBER") : false;

  const { data: pullRequests, isLoading: isLoadingPRs } = useQuery({
    queryKey: ["toolkit-prs", repositoryId],
    queryFn: async () => {
      const result = await getToolkitPullRequests(repositoryId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: Boolean(repositoryId),
    staleTime: 1000 * 30,
  });

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];
  const prValue = Number.parseInt(prNumber, 10);
  const hasPr = Number.isInteger(prValue) && prValue > 0;

  const afterRun = () => queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY });

  const describe = useMutation({
    mutationFn: async () => await generatePullRequestDescription(repositoryId, prValue),
    onSuccess: (result) => {
      afterRun();
      if (!result.ok) return void toast.error(result.error);
      setTitle(result.data.title);
      setBody(result.data.body);
      setPreviewBody(false);
      toast.success("Description generated");
    },
  });

  const apply = useMutation({
    mutationFn: async () => await applyPullRequestDescription(repositoryId, prValue, title, body),
    onSuccess: (result) => {
      if (result.ok) toast.success("Pull request updated on GitHub");
      else toast.error(result.error);
    },
  });

  const tests = useMutation({
    mutationFn: async () => await generateTestsForPullRequest(repositoryId, prValue),
    onSuccess: (result) => {
      afterRun();
      if (!result.ok) return void toast.error(result.error);
      setTestsMarkdown(result.data.markdown);
      toast.success("Tests generated");
    },
  });

  const release = useMutation({
    mutationFn: async () => await generateReleaseNotes(repositoryId, Number(days)),
    onSuccess: (result) => {
      afterRun();
      if (!result.ok) return void toast.error(result.error);
      setReleaseMarkdown(result.data.markdown);
      setReleaseCount(result.data.prCount);
    },
  });

  const scan = useMutation({
    mutationFn: async () => await scanPullRequestSecurity(repositoryId, prValue),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.error);
    },
  });

  const scanResult = scan.data && scan.data.ok ? scan.data.data : null;

  const busy =
    (tab === "description" && describe.isPending) ||
    (tab === "tests" && tests.isPending) ||
    (tab === "release" && release.isPending) ||
    (tab === "security" && scan.isPending);

  const runDisabled =
    busy ||
    !repositoryId ||
    (activeTab.needsPr && !hasPr) ||
    (tab !== "security" && !canGenerate);

  const run = () => {
    if (tab === "description") describe.mutate();
    else if (tab === "tests") tests.mutate();
    else if (tab === "release") release.mutate();
    else scan.mutate();
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-6 px-2 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
            <Wrench className="h-7 w-7 text-blue-600" /> AI Toolkit
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate pull request descriptions, unit tests and release notes, or scan a PR for leaked secrets and vulnerable packages.
          </p>
        </div>
      </div>

      <UsageMeter />

      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardContent className="space-y-4">
          <div className="flex w-fit flex-wrap items-center gap-1 rounded-xl bg-slate-200/70 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                  tab === t.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Repository</label>
              <select
                value={repositoryId}
                onChange={(e) => {
                  setRepoOverride(e.target.value);
                  setPrNumber("");
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {repositories?.length ? (
                  repositories.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName}
                    </option>
                  ))
                ) : (
                  <option value="">No repositories connected</option>
                )}
              </select>
            </div>

            {activeTab.needsPr ? (
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Pull request
                  {isLoadingPRs && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                </label>
                <select
                  value={pullRequests?.some((p) => String(p.number) === prNumber) ? prNumber : ""}
                  onChange={(e) => setPrNumber(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select a pull request</option>
                  {pullRequests?.map((p) => (
                    <option key={p.number} value={p.number}>
                      #{p.number} {p.title} ({p.state})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Period</label>
                <select
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="7">Last 7 days</option>
                  <option value="14">Last 14 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="60">Last 60 days</option>
                </select>
              </div>
            )}

            <Button
              onClick={run}
              disabled={runDisabled}
              className="h-10 gap-2 bg-blue-600 text-white hover:bg-blue-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {tab === "security" ? "Run scan" : "Generate"}
            </Button>
          </div>

          {tab !== "security" && repository && !canGenerate && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You have view-only access to this repository, so generation is disabled.
            </p>
          )}
        </CardContent>
      </Card>

      {tab === "description" && (title || body) && (
        <Card className="border-slate-200/80 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Generated description</CardTitle>
              <CardDescription>Edit anything, then copy it or push it straight to the pull request.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={`${title}\n\n${body}`} />
              <Button
                size="sm"
                onClick={() => apply.mutate()}
                disabled={apply.isPending || !title.trim() || !canGenerate}
                className="h-8 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
              >
                {apply.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Apply to PR
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={256} className="font-semibold" />

            <div className="flex gap-1">
              {[
                { label: "Edit", value: false },
                { label: "Preview", value: true },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setPreviewBody(option.value)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${
                    previewBody === option.value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {previewBody ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <MarkdownView>{body}</MarkdownView>
              </div>
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={16}
                className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </CardContent>
        </Card>
      )}

      {tab === "tests" && testsMarkdown && (
        <Card className="border-slate-200/80 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Suggested tests</CardTitle>
              <CardDescription>Review before committing. Generated tests may need small adjustments to imports.</CardDescription>
            </div>
            <CopyButton text={testsMarkdown} />
          </CardHeader>
          <CardContent>
            <MarkdownView>{testsMarkdown}</MarkdownView>
          </CardContent>
        </Card>
      )}

      {tab === "release" && releaseMarkdown && (
        <Card className="border-slate-200/80 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Release notes</CardTitle>
              <CardDescription>
                {releaseCount === null ? "" : `Built from ${releaseCount} merged pull request${releaseCount === 1 ? "" : "s"}.`}
              </CardDescription>
            </div>
            <CopyButton text={releaseMarkdown} />
          </CardHeader>
          <CardContent>
            <MarkdownView>{releaseMarkdown}</MarkdownView>
          </CardContent>
        </Card>
      )}

      {tab === "security" && scanResult && (
        <Card className="border-slate-200/80 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Scan results for {scanResult.prTitle}</CardTitle>
            <CardDescription>
              {scanResult.filesScanned} file{scanResult.filesScanned === 1 ? "" : "s"} scanned,{" "}
              {scanResult.dependenciesChecked} dependenc{scanResult.dependenciesChecked === 1 ? "y" : "ies"} checked against the OSV database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scanResult.findings.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <ShieldCheck className="h-4 w-4" /> No leaked secrets or vulnerable dependencies were found in this change.
              </div>
            ) : (
              scanResult.findings.map((finding, index) => (
                <div key={`${finding.title}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`font-semibold ${SEVERITY_STYLES[finding.severity].badge}`}>
                      {SEVERITY_LABELS[finding.severity]}
                    </Badge>
                    {finding.file && (
                      <span className="font-mono text-xs text-slate-500">
                        {finding.file}
                        {finding.line ? `:${finding.line}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{finding.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{finding.detail}</p>
                  {finding.suggestion && <p className="mt-1.5 text-sm text-blue-700">{finding.suggestion}</p>}
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
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <ToolkitContent />
    </Suspense>
  );
}
