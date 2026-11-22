"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Github, LockKeyhole, Mail, Rat, ShieldCheck, UserRound, GitPullRequest, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { neonGetSession, neonSignIn, neonSignUp, signIn } from "@/lib/auth-client";
import { signInCode, signInMessage, type GitHubSignInCode } from "@/module/auth/lib/github-sign-in";

export default function LoginPage({ authOrigin, initialError }: {
  authOrigin: string;
  initialError: GitHubSignInCode | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [githubError, setGithubError] = useState(initialError);
  const [emailMode, setEmailMode] = useState<"signIn" | "signUp">("signIn");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);

  const handleGithubSignIn = async () => {
    if (window.location.origin !== authOrigin) {
      setGithubError("login_origin_mismatch");
      return;
    }
    setGithubError(null);
    setLoading(true);

    try {
      const { data, error } = await signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
        errorCallbackURL: "/login",
      });
      if (error || !data?.url) {
        setGithubError(signInCode(error?.code, "sign-in", error?.status));
      }
    } catch {
      setGithubError("network_error");
    }
    setLoading(false);
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    setCurrentUser(null);
    setEmailLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const result = emailMode === "signUp"
        ? await neonSignUp.email({
            name: String(formData.get("name") ?? "").trim(),
            email,
            password,
          })
        : await neonSignIn.email({ email, password });

      if (result.error) {
        setEmailError(result.error.message || "Email sign-in failed. Please try again.");
        return;
      }

      const session = await neonGetSession();
      if (session.error) {
        setEmailError(session.error.message || "Could not read the signed-in user.");
        return;
      }
      if (!session.data?.user) {
        setEmailError(
          "The account was created, but no session is active. Check whether email verification is required, then sign in.",
        );
        return;
      }

      setCurrentUser({
        name: session.data.user.name,
        email: session.data.user.email,
      });
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Email sign-in failed. Please try again.");
    } finally {
      setEmailLoading(false);
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
              Continue with GitHub or use your email and password.
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

          {githubError && (
            <div role="alert" className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p>{signInMessage(githubError)}</p>
              {githubError === "login_origin_mismatch" && (
                <a href={`${authOrigin}/login`} className="block break-all font-medium underline">
                  Continue on {authOrigin}
                </a>
              )}
              {["login_origin_mismatch", "invalid_origin", "redirect_uri_mismatch", "invalid_code"].includes(githubError) && (
                <p>Configured callback <code className="block break-all">{authOrigin}/api/auth/callback/github</code></p>
              )}
              <p className="text-xs">Error code <code>{githubError}</code></p>
            </div>
          )}

          <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            OR CONTINUE WITH EMAIL
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {emailMode === "signUp" && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
                <span className="relative block">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    maxLength={100}
                    className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Your name"
                  />
                </span>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="you@example.com"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  name="password"
                  type="password"
                  autoComplete={emailMode === "signUp" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="At least 8 characters"
                />
              </span>
            </label>

            {emailError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {emailError}
              </p>
            )}

            {currentUser && (
              <div role="status" className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                <p>
                  Signed in as <strong>{currentUser.name}</strong> ({currentUser.email})
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="inline-flex items-center gap-1 font-semibold text-green-800 hover:underline"
                >
                  Continue to RepoPilot <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={emailLoading}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {emailLoading
                ? (emailMode === "signUp" ? "Creating account..." : "Signing in...")
                : (emailMode === "signUp" ? "Create account" : "Sign in with email")}
            </button>
          </form>

          <p className="mt-3 text-center text-sm text-gray-600">
            {emailMode === "signUp" ? "Already have an account?" : "New to RepoPilot?"}{" "}
            <button
              type="button"
              onClick={() => {
                setEmailMode(emailMode === "signUp" ? "signIn" : "signUp");
                setEmailError(null);
                setCurrentUser(null);
              }}
              className="font-semibold text-blue-700 hover:underline"
            >
              {emailMode === "signUp" ? "Sign in" : "Create an account"}
            </button>
          </p>

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
