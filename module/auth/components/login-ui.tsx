"use client";

import { useState } from "react";
import { Github, Rat, ShieldCheck, GitPullRequest, Sparkles } from "lucide-react";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  const handleGithubSignIn = async () => {
    setGithubError(null);
    setLoading(true);

    try {
      await signIn.social({
        provider: "github",
      });
    } catch (error) {
      console.error("Error during GitHub sign-in:", error);

      const message =
        error instanceof Error
          ? error.message
          : "GitHub sign-in failed. Please check the GitHub OAuth setup or callback URL.";

      setGithubError(
        message.includes("redirect") || message.includes("callback")
          ? "GitHub sign-in failed because the callback URL does not match. Please check the GitHub OAuth app settings."
          : "GitHub sign-in failed. Please try again or check the GitHub OAuth configuration."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_38%)]">
      <div className="hidden lg:flex lg:w-3/5 items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-sky-100 p-12">
        <div className="w-full max-w-2xl">
          <AIIllustration />
        </div>
      </div>

      <div className="flex w-full items-center justify-center p-6 sm:p-8 lg:w-2/5">
        <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-[0_30px_80px_-40px_rgba(37,99,235,0.4)] backdrop-blur-md sm:p-7">
          <div className="text-center mb-8 animate-fade-in">
            <div className="flex items-center justify-center gap-x-3">
              <div className="rounded-2xl bg-blue-100 p-2 shadow-sm">
                <Rat className="h-10 w-10 text-blue-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900 tracking-tight mt-2">
                RepoPilot
              </h1>
            </div>
          </div>

          <div className="mb-6 text-center animate-fade-in-delay">
            <h2 className="text-xl font-semibold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">
              Sign in with your GitHub account to connect repositories and get AI reviews.
            </p>
          </div>

          {/* GitHub Sign In */}
          <button
            type="button"
            onClick={handleGithubSignIn}
            disabled={loading}
            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center cursor-pointer shadow-sm hover:-translate-y-0.5 ${
              loading
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg active:translate-y-0 focus:outline-none focus:ring-4 focus:ring-gray-200"
            }`}
          >
            <Github className="h-5 w-5 mr-2" />
            {loading ? "Connecting to GitHub..." : "Continue with GitHub"}
          </button>

          <ul className="mt-6 space-y-2.5 text-sm text-gray-600">
            <li className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
              Risk-scored AI reviews on every pull request
            </li>
            <li className="flex items-center gap-2.5">
              <GitPullRequest className="h-4 w-4 shrink-0 text-blue-600" />
              Automatic GitHub comments and quality-gate checks
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />
              Only the access you grant through GitHub OAuth
            </li>
          </ul>

          {githubError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {githubError}
            </div>
          )}

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-gray-500">
            By signing in, you agree to our{" "}
            <a
              href="#"
              className="text-blue-600 hover:text-blue-700 transition-colors"
            >
              Terms of Service
            </a>
          </p>
        </div>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInDelay {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          20% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.6s ease-out;
        }

        .animate-fade-in-delay {
          animation: fadeInDelay 0.8s ease-out;
        }
      `}</style>
    </div>
  );
}

function AIIllustration() {
  return (
    <div className="space-y-8 text-center">
      <svg
        viewBox="0 0 200 200"
        className="w-full h-auto max-w-sm mx-auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Central node */}
        <circle cx="100" cy="100" r="40" fill="#1e40af" opacity="0.1" />
        <circle
          cx="100"
          cy="100"
          r="30"
          fill="none"
          stroke="#1e40af"
          strokeWidth="2"
        />
        <circle cx="100" cy="100" r="8" fill="#1e40af" />

        {/* Surrounding nodes */}
        <circle cx="160" cy="100" r="6" fill="#3b82f6" opacity="0.6" />
        <circle cx="40" cy="100" r="6" fill="#3b82f6" opacity="0.6" />
        <circle cx="100" cy="160" r="6" fill="#3b82f6" opacity="0.6" />
        <circle cx="100" cy="40" r="6" fill="#3b82f6" opacity="0.6" />

        {/* Diagonal nodes */}
        <circle cx="142" cy="142" r="6" fill="#3b82f6" opacity="0.4" />
        <circle cx="58" cy="58" r="6" fill="#3b82f6" opacity="0.4" />
        <circle cx="142" cy="58" r="6" fill="#3b82f6" opacity="0.4" />
        <circle cx="58" cy="142" r="6" fill="#3b82f6" opacity="0.4" />

        {/* Connecting lines */}
        <line
          x1="100"
          y1="100"
          x2="160"
          y2="100"
          stroke="#3b82f6"
          strokeWidth="1.5"
          opacity="0.3"
        />
        <line
          x1="100"
          y1="100"
          x2="40"
          y2="100"
          stroke="#3b82f6"
          strokeWidth="1.5"
          opacity="0.3"
        />
        <line
          x1="100"
          y1="100"
          x2="100"
          y2="160"
          stroke="#3b82f6"
          strokeWidth="1.5"
          opacity="0.3"
        />
        <line
          x1="100"
          y1="100"
          x2="100"
          y2="40"
          stroke="#3b82f6"
          strokeWidth="1.5"
          opacity="0.3"
        />
      </svg>

      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2 italic">
          AI Intelligent Code Reviewer
        </h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          Powered by advanced AI to analyze, review, and improve your code in
          seconds
        </p>
      </div>
    </div>
  );
}
