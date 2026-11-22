import { authOrigin, legacyAuth } from "@/lib/auth";
import { signInCode, signInMessage, type GitHubSignInCode, type SignInStage } from "@/module/auth/lib/github-sign-in";

function databaseFailure(error: unknown): GitHubSignInCode | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return;
  switch (error.code) {
    case "P1001": case "P1002": case "P1003": case "P1017": case "P2024":
    case "ECONNREFUSED": case "ENOTFOUND": case "ETIMEDOUT":
      return "database_unavailable";
    case "P2021": case "P2022": case "42P01": case "42703":
      return "database_schema_error";
    case "P1000": case "P1010": case "28P01": case "42501":
      return "database_access_denied";
  }
}

function failureResponse(stage: SignInStage, code: GitHubSignInCode, status: number, headers?: Headers) {
  console.warn("[auth/github]", { stage, code, status });
  const resultHeaders = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of headers?.getSetCookie() ?? []) resultHeaders.append("Set-Cookie", cookie);
  const retryAfter = headers?.get("Retry-After");
  if (retryAfter) resultHeaders.set("Retry-After", retryAfter);
  if (stage === "sign-in") {
    return Response.json({ code, message: signInMessage(code) }, { status, headers: resultHeaders });
  }
  resultHeaders.set("Location", `${authOrigin}/login?error=${code}`);
  return new Response(null, { status: 303, headers: resultHeaders });
}

async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const stage = path === "/api/auth/sign-in/social" ? "sign-in"
    : path === "/api/auth/callback/github" ? "callback" : undefined;
  if (!stage) return legacyAuth.handler(request);

  try {
    const response = await legacyAuth.handler(request);
    if (response.status >= 400) {
      const body = await response.json().catch(() => null);
      return failureResponse(stage, signInCode(body?.code, stage, response.status), response.status, response.headers);
    }
    const location = response.headers.get("Location");
    if (stage === "callback" && location && response.status >= 300 && response.status < 400) {
      const target = new URL(location, authOrigin);
      if (target.origin === authOrigin && target.pathname === "/login") {
        // Better Auth 1.4 reports a missing state in the 'state' parameter.
        const error = target.searchParams.get("error") ??
          (target.searchParams.get("state") === "state_not_found" ? "state_not_found" : null);
        if (error) return failureResponse(stage, signInCode(error, stage), response.status, response.headers);
      }
    }
    return response;
  } catch (error) {
    const databaseCode = databaseFailure(error);
    if (!databaseCode) {
      const type = error instanceof Error ? error.constructor.name : "UnknownError";
      console.error("[auth/github] Handler exception", { stage, type });
    }
    return failureResponse(stage, databaseCode ?? signInCode(null, stage), databaseCode ? 503 : 500);
  }
}

export { handle as GET, handle as POST };
