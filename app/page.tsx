"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Github,
  Zap,
  ShieldCheck,
  MessageSquareCode,
  History,
  Sparkles,
  Rat,
} from "lucide-react";
import Link from "next/link";
import { requireUnAuth } from '@/module/utils/auth-utils'


export default function LandingPage() {
  const footerGroups: Array<{ heading: string; items: string[] }> = [
    { heading: "Product", items: ["Features", "Pricing", "Security"] },
    { heading: "Company", items: ["About", "Blog", "Careers"] },
    { heading: "Legal", items: ["Privacy", "Terms"] },
  ];

  useEffect(() => {
    requireUnAuth();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-transparent selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/75 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-50 p-2 shadow-sm ring-1 ring-blue-100">
              <Rat className="h-8 w-8 text-blue-600" />
            </div>
            <span className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              RepoPilot
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
              <Link href="#features" className="transition-colors hover:text-primary">
                Features
              </Link>
              <Link href="#how-it-works" className="transition-colors hover:text-primary">
                How it works
              </Link>
            </nav>

            <Link href="/dashboard/admin">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold text-xs h-9 px-3"
              >
                <ShieldCheck className="h-4 w-4 text-purple-600" />
                Admin Panel
              </Button>
            </Link>

            <Link href="/dashboard">
              <Button size="sm" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 shadow-sm">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden pb-16 pt-20 md:pb-24 md:pt-28">
          <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_44%)]" />
          <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              AI code review for modern engineering teams
            </div>

            <h1 className="mx-auto max-w-5xl text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl md:text-6xl lg:text-7xl leading-[1.15] md:leading-[1.12]">
              The AI code reviewer
              <span className="mt-2 block bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent pb-3 pt-1">
                your team will actually trust
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 md:text-xl">
              Automate code reviews, catch critical bugs, and enforce quality
              standards on every pull request. Ship better code, faster.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/dashboard">
                <Button
                  size="lg"
                  className="h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30"
                >
                  Start Reviewing
                </Button>
              </Link>
              <Link href="/dashboard/admin">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-2xl border-purple-200 bg-purple-50/80 px-6 text-base font-semibold text-purple-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-300 hover:bg-purple-100 flex items-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5 text-purple-600" />
                  Admin Panel
                </Button>
              </Link>
            </div>

            <div className="relative mx-auto mt-16 max-w-5xl">
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 blur-2xl" />
              <div className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/80 shadow-[0_30px_80px_-30px_rgba(37,99,235,0.35)] backdrop-blur-sm">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-amber-400" />
                    <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  </div>
                  <div className="ml-4 h-2.5 w-40 rounded-full bg-slate-200" />
                </div>

                <div className="space-y-5 p-4 md:p-8">
                  <div className="flex items-start gap-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                    <div className="mt-1 rounded-xl bg-blue-600 p-2 text-white shadow-sm">
                      <Rat className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <p className="mb-1 text-sm font-semibold text-slate-900">RepoPilot</p>
                      <p className="text-sm leading-relaxed text-slate-600">
                        I found a potential memory leak in{" "}
                        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-blue-700 ring-1 ring-blue-100">
                          useDataHook.ts
                        </code>
                        . The cleanup function is missing the event listener removal.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1.5fr_0.75fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-400">
                        <span>Risk</span>
                        <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-700">Medium</span>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2.5 w-full rounded-full bg-slate-200">
                          <div className="h-2.5 w-[72%] rounded-full bg-gradient-to-r from-amber-400 to-orange-500" />
                        </div>
                        <div className="h-2.5 w-[88%] rounded-full bg-slate-200" />
                        <div className="h-2.5 w-[64%] rounded-full bg-slate-200" />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-left">
                      <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Fix confidence</p>
                      <p className="mt-3 text-3xl font-bold text-emerald-600">94%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-4 w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-white/70 p-6 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)] backdrop-blur-sm md:grid-cols-4 md:p-8">
            {[
              { value: "50%", label: "Faster review cycles" },
              { value: "25%", label: "Work efficiency boost" },
              { value: "90%", label: "Security findings caught" },
              { value: "3.5-4h", label: "Saved per week" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5 text-center transition-transform duration-200 hover:-translate-y-1">
                <p className="text-3xl font-black tracking-tight text-slate-900">{stat.value}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
                Integrate in seconds.
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                RepoPilot plugs directly into your GitHub workflow with zero heavy setup.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  icon: <Github className="h-6 w-6" />,
                  title: "Connect repo",
                  desc: "One-click GitHub OAuth and instant repo access for your team.",
                },
                {
                  icon: <MessageSquareCode className="h-6 w-6" />,
                  title: "Submit PR",
                  desc: "Open a pull request as usual and let RepoPilot start analyzing immediately.",
                },
                {
                  icon: <Sparkles className="h-6 w-6" />,
                  title: "Get insights",
                  desc: "Receive clear, prioritized suggestions that developers can act on quickly.",
                },
              ].map((step, index) => (
                <div key={step.title} className="group rounded-[1.5rem] border border-slate-200 bg-white/80 p-6 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-100/80">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
                    {step.icon}
                  </div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                    0{index + 1}
                  </div>
                  <h3 className="mb-3 text-xl font-semibold text-slate-900">{step.title}</h3>
                  <p className="text-slate-600">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="bg-slate-50/80 py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Features</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                  Everything you need to ship cleaner code.
                </h2>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: <Zap className="h-5 w-5" />,
                  title: "Real-time feedback",
                  desc: "Get instant review comments as soon as a PR is opened or updated.",
                  tone: "blue",
                },
                {
                  icon: <ShieldCheck className="h-5 w-5" />,
                  title: "Security deep-scan",
                  desc: "Catch risky patterns before production with AI-assisted audit checks.",
                  tone: "emerald",
                },
                {
                  icon: <History className="h-5 w-5" />,
                  title: "Repo context",
                  desc: "Understand code history and architecture across your project with confidence.",
                  tone: "violet",
                },
              ].map((feature) => (
                <div key={feature.title} className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200">
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-${feature.tone}-100 text-${feature.tone}-600`}>
                    {feature.icon}
                  </div>
                  <h3 className="mb-3 text-xl font-semibold text-slate-900">{feature.title}</h3>
                  <p className="text-slate-600">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/80 py-12 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-600 p-2 text-white">
                  <Rat className="h-4 w-4" />
                </div>
                <span className="text-lg font-semibold text-slate-900">RepoPilot</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Empowering engineering teams with AI-driven code intelligence and security auditing.
              </p>
            </div>

            <div className="grid gap-10 sm:grid-cols-3">
              {footerGroups.map(({ heading, items }) => (
                <div key={heading}>
                  <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {heading}
                  </h4>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {items.map((item) => (
                      <li key={item}>
                        <Link href="#" className="transition-colors hover:text-primary">
                          {item}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-6 text-sm text-slate-500 sm:flex-row">
            <p>All rights reserved <a href="https://repopilot.team" className="font-medium text-slate-700 hover:text-primary">@RepoPilotTeam</a></p>
            <div className="flex gap-6">
              <Link href="https://repopilot.team" className="transition-colors hover:text-primary">Website</Link>
              <Link href="https://github.com/repopilot-team" className="transition-colors hover:text-primary">GitHub</Link>
              <Link href="https://www.linkedin.com/company/repopilot-team" className="transition-colors hover:text-primary">LinkedIn</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
