"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Github,
  Zap,
  ShieldCheck,
  Sparkles,
  Rat,
  CheckCircle2,
  ArrowRight,
  GitPullRequest,
  Check,
  Flame,
  Activity,
  Code2,
} from "lucide-react";
import Link from "next/link";
import { requireUnAuth } from "@/module/utils/auth-utils";
import ActivityHeatmap, { type ActivityDay } from "@/components/ui/activity-heatmap";

// Generate mock contribution days for live landing page heatmap demo
function generateLandingDays(): ActivityDay[] {
  const days: ActivityDay[] = [];
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  let seed = 73;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const roll = rand();
    const count =
      roll > 0.7
        ? Math.floor(roll * 14)
        : roll > 0.35
          ? Math.floor(roll * 5)
          : 0;
    days.push({ date: new Date(t).toISOString().slice(0, 10), count });
  }
  return days;
}

export default function LandingPage() {
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null);
  const heatmapDays = useMemo(() => generateLandingDays(), []);

  const footerGroups: Array<{ heading: string; items: string[] }> = [
    { heading: "Product", items: ["Features", "Pricing", "Live Demo", "Security"] },
    { heading: "Resources", items: ["Documentation", "API Reference", "GitHub Integration"] },
    { heading: "Company", items: ["About Us", "Changelog", "Contact Support"] },
  ];

  useEffect(() => {
    requireUnAuth();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased selection:bg-blue-600/20">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-50 p-2 shadow-sm ring-1 ring-blue-100">
              <Rat className="h-7 w-7 text-blue-600" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              RepoPilot
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">
            <Link href="#features" className="transition-colors hover:text-blue-600">
              Features
            </Link>
            <Link href="#how-it-works" className="transition-colors hover:text-blue-600">
              How it Works
            </Link>
            <Link href="#activity" className="transition-colors hover:text-blue-600">
              Activity Heatmap
            </Link>
            <Link href="#pricing" className="transition-colors hover:text-blue-600">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold text-xs h-9 px-3.5 shadow-sm"
              >
                <ShieldCheck className="h-4 w-4 text-purple-600" />
                Admin Panel
              </Button>
            </Link>

            <Link href="/dashboard">
              <Button
                size="sm"
                className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 shadow-sm"
              >
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pb-16 pt-20 md:pb-24 md:pt-28">
          <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_45%)]" />

          <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/90 px-4 py-1.5 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              Powered by Google Gemini Flash & Pinecone RAG Context
            </div>

            <h1 className="mx-auto max-w-5xl text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl md:text-6xl lg:text-7xl leading-[1.18] md:leading-[1.15]">
              AI Code Reviews in Seconds,
              <span className="mt-2 block bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent pb-3 pt-1">
                Zero Guesswork on Every PR
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 md:text-xl leading-relaxed">
              Connect your GitHub repositories, fetch live pull requests with one click, and receive lightning-fast, high-accuracy AI reviews with architectural suggestions.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/dashboard">
                <Button
                  size="lg"
                  className="h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/35 flex items-center gap-2"
                >
                  <Zap className="w-4 h-4 fill-white" />
                  Start Reviewing Free
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>

              <Link href="/dashboard/admin">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-2xl border-purple-200 bg-purple-50/80 px-6 text-base font-semibold text-purple-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-300 hover:bg-purple-100 flex items-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5 text-purple-600" />
                  Admin Control Panel
                </Button>
              </Link>
            </div>

            {/* Interactive Mock Review Showcase Card */}
            <div className="relative mx-auto mt-16 max-w-4xl">
              <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-r from-blue-500/15 via-indigo-500/15 to-violet-500/15 blur-2xl" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/90 shadow-[0_30px_90px_-30px_rgba(37,99,235,0.3)] backdrop-blur-sm text-left">
                {/* Window Bar */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-400" />
                      <div className="h-3 w-3 rounded-full bg-amber-400" />
                      <div className="h-3 w-3 rounded-full bg-emerald-400" />
                    </div>
                    <span className="ml-3 font-mono text-xs text-slate-500">
                      ybthummar/AICodeReview &bull; PR #14 &bull; auth-flow &rarr; main
                    </span>
                  </div>

                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-300 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    AI Review &bull; 4.8s
                  </Badge>
                </div>

                {/* Review Body */}
                <div className="p-6 md:p-8 space-y-5">
                  <div className="flex items-start gap-3.5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                    <div className="rounded-xl bg-blue-600 p-2 text-white shadow-sm shrink-0">
                      <Rat className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">RepoPilot AI</span>
                        <Badge variant="outline" className="text-[10px] bg-white text-blue-700 border-blue-200">
                          Senior Architect Verdict
                        </Badge>
                      </div>
                      <p className="text-xs md:text-sm text-slate-700 leading-relaxed">
                        Identified token refresh race condition in <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-blue-700 border border-blue-200">lib/auth-client.ts</code>. The session verification was awaiting an unhandled promise on concurrent reloads.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Security Risk</span>
                      <p className="text-base font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Low (0 Vulnerabilities)
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Context Matched</span>
                      <p className="text-base font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                        <Code2 className="w-4 h-4 text-blue-600" /> 18 AST Symbols
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Confidence</span>
                      <p className="text-base font-bold text-emerald-600 mt-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 98.4%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live Activity Heatmap Section */}
        <section id="activity" className="py-20 border-y border-slate-200 bg-slate-50/60">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <Badge variant="outline" className="mb-3 bg-white text-blue-700 border-blue-200 font-semibold px-3 py-1">
                <Activity className="w-3.5 h-3.5 mr-1 text-blue-600" />
                Live Contribution Calendar
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Track Team Cadence & PR Reviews Across 52 Weeks
              </h2>
              <p className="mt-3 text-base text-slate-600">
                Visualize commits, pull requests, and automated AI reviews with our high-performance contribution graph component.
              </p>
            </div>

            <div className="mx-auto max-w-4xl">
              <Card className="shadow-md border border-slate-200/90 bg-white p-6 sm:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-amber-500" />
                    <span className="font-bold text-slate-900 text-base">Annual Review & Commit Rhythm</span>
                  </div>
                  {selectedHeatmapDate && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Selected: {selectedHeatmapDate}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto pt-2">
                  <ActivityHeatmap
                    days={heatmapDays}
                    label="Annual Engineering Rhythm"
                    period="the last year"
                    selectedDate={selectedHeatmapDate}
                    onSelectDate={setSelectedHeatmapDate}
                  />
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600 mb-2">Simple Workflow</p>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Set up in under 60 seconds
              </h2>
              <p className="mt-3 text-base text-slate-600">
                RepoPilot seamlessly integrates into your existing GitHub setup without complex configuration.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
              {[
                {
                  step: "01",
                  icon: <Github className="h-6 w-6" />,
                  title: "Connect Repository",
                  desc: "Connect your GitHub repositories in 1-click via OAuth. Free users connect 1 repo; Pro users connect unlimited repos.",
                },
                {
                  step: "02",
                  icon: <GitPullRequest className="h-6 w-6" />,
                  title: "Inspect Live PRs",
                  desc: "Browse all open and active pull requests directly on your dashboard. Zero guessing PR numbers.",
                },
                {
                  step: "03",
                  icon: <Sparkles className="h-6 w-6" />,
                  title: "1-Click AI Review",
                  desc: "Launch comprehensive Gemini AI code reviews in ~5s with Pinecone AST symbol context and automated GitHub comments.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                    {item.icon}
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    STEP {item.step}
                  </span>
                  <h3 className="mt-3 mb-2 text-xl font-bold text-slate-900">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-20 bg-slate-50/70 border-t border-slate-200">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <Badge variant="outline" className="mb-2 bg-white text-blue-700 border-blue-200 font-semibold px-3 py-1">
                Transparent Pricing
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Simple, Honest Plans for Every Developer
              </h2>
              <p className="mt-3 text-base text-slate-600">
                Get started free or unlock unlimited repositories with our affordable Pro tier.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto items-stretch">
              {/* Free Plan */}
              <Card className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-slate-900">Free Tier</h3>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-semibold text-xs">
                      Starter
                    </Badge>
                  </div>
                  <div className="mb-6 flex items-baseline">
                    <span className="text-5xl font-black tracking-tight text-slate-900">&#8377;0</span>
                    <span className="ml-2 text-sm text-slate-500 font-medium">/ forever</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 mb-6">
                    Perfect for individual hobbyists experimenting with automated AI code reviews.
                  </p>

                  <ul className="space-y-3.5 text-sm text-slate-700 mb-8">
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Connect <strong>1 GitHub Repository</strong></span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Standard AI Code Reviews</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Live Pull Request Listing</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Markdown Review Reports & Copy</span>
                    </li>
                  </ul>
                </div>

                <Link href="/dashboard" className="w-full">
                  <Button variant="outline" className="w-full h-11 rounded-xl border-slate-300 font-semibold text-slate-700 hover:bg-slate-50">
                    Get Started Free
                  </Button>
                </Link>
              </Card>

              {/* Pro Plan */}
              <Card className="relative rounded-3xl border-2 border-blue-600 bg-white p-8 shadow-xl shadow-blue-500/10 flex flex-col justify-between">
                <div className="absolute -top-3.5 right-8">
                  <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs px-3 py-1 shadow-sm">
                    MOST POPULAR
                  </Badge>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-slate-900">Pro Tier</h3>
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-xs">
                      Full Power
                    </Badge>
                  </div>
                  <div className="mb-6 flex items-baseline">
                    <span className="text-5xl font-black tracking-tight text-slate-900">&#8377;149</span>
                    <span className="ml-2 text-sm text-slate-500 font-medium">/ month</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 mb-6">
                    For active developers and teams demanding unlimited repos, RAG context, and instant analysis.
                  </p>

                  <ul className="space-y-3.5 text-sm text-slate-700 mb-8">
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Connect <strong>Unlimited GitHub Repositories</strong></span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      <span><strong>High-Speed Gemini Flash AI</strong> (~5s reviews)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      <span><strong>Pinecone RAG Context</strong> (Symbol embeddings)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Automated GitHub PR Comments</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>52-Week Contribution Heatmap</span>
                    </li>
                  </ul>
                </div>

                <Link href="/dashboard/subscriptions" className="w-full">
                  <Button className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/20">
                    Upgrade to Pro (&bull; &#8377;149/mo)
                  </Button>
                </Link>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between items-start">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-blue-600 p-1.5 text-white">
                  <Rat className="h-5 w-5" />
                </div>
                <span className="text-xl font-bold text-slate-900">RepoPilot</span>
              </div>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
                Empowering developers with automated AI code reviews, AST repository context, and real-time GitHub integration.
              </p>
            </div>

            <div className="grid gap-10 grid-cols-2 sm:grid-cols-3">
              {footerGroups.map(({ heading, items }) => (
                <div key={heading}>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                    {heading}
                  </h4>
                  <ul className="space-y-2 text-xs sm:text-sm text-slate-600">
                    {items.map((item) => (
                      <li key={item}>
                        <Link href="#features" className="hover:text-blue-600 transition-colors">
                          {item}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <p>&copy; {new Date().getFullYear()} RepoPilot AI. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/dashboard/admin" className="hover:text-purple-600 transition-colors font-medium">
                Admin Panel
              </Link>
              <Link href="/dashboard" className="hover:text-blue-600 transition-colors font-medium">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
