import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, authOrigin } from "@/lib/auth";
import LoginUI from "@/module/auth/components/login-ui";
import { signInCode, type GitHubSignInCode } from "@/module/auth/lib/github-sign-in";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[]; state?: string | string[] }>;
}) {
  const query = await searchParams;
  let error: GitHubSignInCode | null = query.error ? signInCode(query.error, "callback")
    : query.state === "state_not_found" ? "state_not_found" : null;
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => {
    console.warn("[auth/github]", { stage: "login", code: "session_lookup_failed" });
    error ??= "session_lookup_failed";
    return null;
  });
  if (session) redirect("/dashboard");
  return <LoginUI authOrigin={authOrigin} initialError={error} />;
}
