import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, authOrigin } from "@/lib/auth";
import { isNeonAuthConfigured } from "@/lib/neon-auth";
import LoginUI from "@/module/auth/components/login-ui";
import { signInCode, type GitHubSignInCode } from "@/module/auth/lib/github-sign-in";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{
    error?: string | string[];
    state?: string | string[];
    provider?: string | string[];
    github_reconnect?: string;
  }>;
}) {
  const query = await searchParams;
  const provider = Array.isArray(query.provider) ? query.provider[0] : query.provider;
  const isGoogleError = provider === "google" && Boolean(query.error);
  let error: GitHubSignInCode | null = !isGoogleError && query.error ? signInCode(query.error, "callback")
    : query.state === "state_not_found" ? "state_not_found" : null;
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => {
    console.warn("[auth]", { stage: "login", code: "session_lookup_failed" });
    error ??= "session_lookup_failed";
    return null;
  });
  const reconnectGitHub = query.github_reconnect === "1" || Boolean(session && error);
  if (session && !reconnectGitHub) redirect("/dashboard");
  return (
    <LoginUI
      authOrigin={authOrigin}
      initialError={error}
      initialGoogleError={isGoogleError}
      emailAuthEnabled={!reconnectGitHub && isNeonAuthConfigured()}
      reconnectGitHub={reconnectGitHub}
    />
  );
}
