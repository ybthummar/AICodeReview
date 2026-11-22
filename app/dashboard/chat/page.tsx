"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  Database,
  ExternalLink,
  FileCode,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import MarkdownView from "@/components/markdown-view";
import {
  ACCESSIBLE_REPOSITORIES_QUERY_KEY,
  useAccessibleRepositories,
} from "@/module/team/hooks/use-accessible-repositories";
import { indexInProgress } from "@/module/repository/lib/index-status";
import {
  askCodebase,
  reindexRepository,
} from "@/module/chat/actions";
import type { ChatSource } from "@/module/chat/lib/answer";
import UsageMeter, { USAGE_QUERY_KEY } from "@/module/billing/components/usage-meter";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
}

const EMPTY_THREAD: Message[] = [];

const STARTERS = [
  "Give me a high-level overview of how this project is structured.",
  "Where is authentication handled, and how does it work?",
  "Which functions talk to the database?",
  "What would break if I changed the main data model?",
];

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [threads, setThreads] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const repositoriesQuery = useAccessibleRepositories();

  const repositories = repositoriesQuery.data ?? [];
  const selected = repositories.find((repository) => repository.id === selectedId) ?? repositories[0];
  const repositoryId = selected?.id ?? "";
  const messages = threads[repositoryId] ?? EMPTY_THREAD;
  const indexing = indexInProgress(selected?.indexStatus ?? null);
  const canAsk = selected?.indexStatus === "ready";

  const ask = useMutation({
    mutationFn: (request: Parameters<typeof askCodebase>[0]) => askCodebase(request),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY }),
    onSuccess: (result, { repositoryId }) => {
      if (!result.ok) return;
      const { answer, sources } = result.data;
      setThreads((previous) => ({
        ...previous,
        [repositoryId]: [...(previous[repositoryId] ?? EMPTY_THREAD), { role: "assistant", content: answer, sources }],
      }));
    },
  });

  const reindex = useMutation({
    mutationFn: (id: string) => reindexRepository(id),
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ACCESSIBLE_REPOSITORIES_QUERY_KEY });
        toast.success("Re-index queued. It can take a few minutes for large repositories.");
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Could not queue a re-index. Please try again."),
  });

  const currentRequest = ask.variables?.repositoryId === repositoryId;
  const answering = currentRequest && ask.isPending;
  const askError = currentRequest && (ask.error
    ? "The assistant is unavailable right now. Please try again."
    : ask.data?.ok === false ? ask.data.error : null);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, answering]);

  const send = (question: string) => {
    const text = question.trim();
    if (!text || ask.isPending || !repositoryId || !canAsk) return;

    setThreads((previous) => ({
      ...previous,
      [repositoryId]: [...(previous[repositoryId] ?? EMPTY_THREAD), { role: "user", content: text }],
    }));
    setInput("");
    ask.mutate({ repositoryId, question: text, history: messages.map(({ role, content }) => ({ role, content })) });
  };

  const changeRepository = (id: string) => {
    setSelectedId(id);
    setInput("");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <MessageSquareText className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Ask your codebase</h1>
            <p className="mt-1 text-sm text-slate-600">Explore indexed code with file and line references.</p>
          </div>
        </div>
        <UsageMeter compact kind="chats" />
      </div>

      <Card className="flex min-w-0 flex-1 flex-col gap-0 overflow-hidden border-slate-200 bg-white p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
          <label htmlFor="chat-repository" className="text-sm font-medium text-slate-700">Repository</label>
          <select
            id="chat-repository"
            value={repositoryId}
            onChange={(e) => changeRepository(e.target.value)}
            disabled={!repositories.length}
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-500 sm:max-w-xs sm:text-sm"
          >
            {repositories.length ? (
              repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))
            ) : (
              <option value="">{repositoriesQuery.isPending ? "Loading repositories..." : "Select a repository"}</option>
            )}
          </select>

          {selected?.role === "OWNER" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reindex.mutate(repositoryId)}
              disabled={reindex.isPending || indexing}
              className="gap-1.5"
            >
              {reindex.isPending || indexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {indexing ? "Indexing..." : "Re-index"}
            </Button>
          )}
        </div>
        {selected && !canAsk && (
          <div className="border-b border-slate-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 sm:px-6" role="status">
            {indexing
              ? `Indexing ${selected.fullName}${selected.indexFilesTotal === null
                ? " — preparing repository files..."
                : ` — ${Math.min(selected.indexFilesDone, selected.indexFilesTotal)} of ${selected.indexFilesTotal} files processed.`}`
              : selected.indexStatus === "failed"
                ? "Indexing failed. Re-index the repository to try again."
                : selected.indexStatus === "empty"
                  ? "Indexing finished, but no indexable files were found."
                    : selected.role === "OWNER"
                      ? "Indexing has not started yet. Use Re-index to begin."
                      : "Indexing has not started yet. Ask the repository owner to re-index it."}
          </div>
        )}
        <div ref={transcriptRef} role="log" aria-label="Codebase conversation" className="min-h-64 max-h-[max(19rem,calc(100dvh-21rem))] flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {repositoriesQuery.isError ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-700" role="alert">
              Repositories could not be loaded.
              <Button variant="outline" size="sm" onClick={() => void repositoriesQuery.refetch()}>Retry</Button>
            </div>
          ) : repositoriesQuery.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600" role="status">
              <Loader2 className="size-4 animate-spin" /> Loading repositories...
            </div>
          ) : !repositoryId ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-700">
              Connect a repository to ask questions about its code.
              <Button asChild variant="outline" size="sm"><Link href="/dashboard/repositories">Connect repository</Link></Button>
            </div>
          ) : messages.length === 0 && !canAsk ? (
            <div className="flex items-center justify-center py-16 text-center text-sm text-slate-600">
              Questions will be available when repository indexing is ready.
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-5 text-center sm:py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">What do you want to know?</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  Ask about architecture, where something lives, or what a change could affect.
                </p>
              </div>
              <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => send(starter)}
                    disabled={!repositoryId || !canAsk || ask.isPending}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}>
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`min-w-0 max-w-[88%] wrap-anywhere rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <span className="sr-only">{message.role === "user" ? "You" : "RepoPilot"}</span>
                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  ) : (
                    <MarkdownView>{message.content}</MarkdownView>
                  )}

                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sources</p>
                      <div className="flex flex-wrap gap-1.5">
                        {message.sources.map((source) => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
                          >
                            <FileCode className="size-3 shrink-0" />
                            <span className="wrap-anywhere">{source.path}{source.startLine ? `:${source.startLine}-${source.endLine}` : ""}</span>
                            <ExternalLink className="size-3 shrink-0 opacity-60" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {answering && (
            <div className="flex items-center gap-3 text-sm text-slate-600" role="status">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              Searching the codebase...
            </div>
          )}
        </div>

        {askError && <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-800">{askError}</p>}
        {ask.isPending && !currentRequest && (
          <p role="status" className="border-t border-slate-200 px-4 py-2.5 text-sm text-slate-600">A question is running in another repository.</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 border-t border-slate-200 bg-slate-50/60 p-3 sm:p-4"
        >
          <label htmlFor="chat-question" className="sr-only">Question</label>
          <textarea
            id="chat-question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={!repositoryId ? "Connect a repository first" : canAsk ? "Ask about this repository" : "Available when indexing is complete"}
            disabled={!repositoryId || !canAsk}
            className="min-w-0 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60 sm:text-sm"
          />
          <Button
            type="submit"
            disabled={!input.trim() || ask.isPending || !repositoryId || !canAsk}
            className="h-10 gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Send className="h-4 w-4" /> Ask
          </Button>
        </form>
      </Card>
    </div>
  );
}
