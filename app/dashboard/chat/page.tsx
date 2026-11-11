"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getAccessibleRepositories } from "@/module/team/actions";
import {
  askCodebase,
  reindexRepository,
} from "@/module/chat/actions";
import type { ChatSource } from "@/module/chat/lib/answer";
import { USAGE_QUERY_KEY } from "@/module/billing/components/usage-meter";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  indexed?: boolean;
}

const STARTERS = [
  "Give me a high-level overview of how this project is structured.",
  "Where is authentication handled, and how does it work?",
  "Which functions talk to the database?",
  "What would break if I changed the main data model?",
];

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: repositories, isLoading } = useQuery({
    queryKey: ["accessible-repositories", "VIEWER"],
    queryFn: async () => await getAccessibleRepositories("VIEWER"),
    staleTime: 1000 * 60,
  });

  const repositoryId = selectedId || repositories?.[0]?.id || "";

  const selected = useMemo(
    () => repositories?.find((r) => r.id === repositoryId),
    [repositories, repositoryId]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const ask = useMutation({
    mutationFn: async (question: string) => {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      return await askCodebase({ repositoryId, question, history });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY });

      if (!result.ok) {
        toast.error(result.error);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `I could not answer that: ${result.error}` },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.data.answer,
          sources: result.data.sources,
          indexed: result.data.indexed,
        },
      ]);
    },
    onError: () => {
      toast.error("The assistant is unavailable right now.");
    },
  });

  const reindex = useMutation({
    mutationFn: async () => await reindexRepository(repositoryId),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Indexing started. It can take a few minutes for large repositories.");
      } else {
        toast.error(result.error);
      }
    },
  });

  const send = (question: string) => {
    const text = question.trim();
    if (!text || ask.isPending || !repositoryId) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    ask.mutate(text);
  };

  const changeRepository = (id: string) => {
    setSelectedId(id);
    setMessages([]);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-2 py-4 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
            <MessageSquareText className="h-7 w-7 text-blue-600" /> Ask your codebase
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Questions are answered from your indexed code, with file and line references.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={repositoryId}
            onChange={(e) => changeRepository(e.target.value)}
            disabled={isLoading || !repositories?.length}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

          {selected?.role === "OWNER" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reindex.mutate()}
              disabled={reindex.isPending}
              className="gap-1.5"
            >
              {reindex.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Re-index
            </Button>
          )}
        </div>
      </div>

      <Card className="flex flex-1 flex-col gap-0 overflow-hidden border-slate-200/80 bg-white p-0 shadow-sm">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 320 }}>
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
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
                    disabled={!repositoryId || ask.isPending}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50"
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
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-slate-50/60"
                  }`}
                >
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
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
                          >
                            <FileCode className="h-3 w-3" />
                            {source.path}
                            {source.startLine ? `:${source.startLine}-${source.endLine}` : ""}
                            <ExternalLink className="h-3 w-3 opacity-60" />
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

          {ask.isPending && (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              Searching the codebase and reading the relevant files...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 border-t border-slate-200 bg-slate-50/60 p-3 sm:p-4"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={repositoryId ? "Ask anything about this repository (Shift+Enter for a new line)" : "Connect a repository first"}
            disabled={!repositoryId}
            className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
          />
          <Button
            type="submit"
            disabled={!input.trim() || ask.isPending || !repositoryId}
            className="h-10 gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Send className="h-4 w-4" /> Ask
          </Button>
        </form>
      </Card>
    </div>
  );
}
