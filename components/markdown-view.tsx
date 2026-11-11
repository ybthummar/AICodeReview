"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownView({ children }: { children: string }) {
  return (
    <div className="max-w-none text-sm leading-relaxed text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 border-b border-slate-200 pb-1.5 text-xl font-bold text-slate-900">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 border-b border-slate-200 pb-1 text-lg font-bold text-slate-900">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-base font-semibold text-slate-900">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-2.5 mb-1 text-sm font-semibold text-slate-800">{children}</h4>
          ),
          p: ({ children }) => <p className="mb-3 text-sm leading-relaxed text-slate-700">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-r border-l-4 border-blue-500 bg-blue-50/70 p-3 text-sm italic text-slate-700">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-slate-200" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-slate-100 px-3 py-1.5">{children}</td>,
          pre: ({ children }) => <>{children}</>,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const isBlock = Boolean(match) || String(children).includes("\n");

            return isBlock ? (
              <div className="relative my-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                <div className="border-b border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-400">
                  {match ? match[1] : "code"}
                </div>
                <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-slate-100 sm:text-sm">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            ) : (
              <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs font-medium text-blue-800" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
