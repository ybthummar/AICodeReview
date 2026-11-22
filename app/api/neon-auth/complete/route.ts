import { getNeonAuth, isNeonAuthConfigured } from "@/lib/neon-auth";

export async function GET(request: Request) {
  const responseHeaders = new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    Location: "/login?provider=google&error=oauth_session_failed",
  });
  const url = new URL(request.url);
  if (!url.searchParams.get("neon_auth_session_verifier") || !isNeonAuthConfigured()) {
    return new Response(null, { status: 303, headers: responseHeaders });
  }

  // Forward the verifier and challenge cookie through Neon's SDK before loading
  // the protected dashboard. The SDK exchanges them for the app's session cookies.
  url.searchParams.set("disableCookieCache", "true");
  const response = await getNeonAuth().handler().GET(new Request(url, {
    headers: request.headers,
  }), {
    params: Promise.resolve({ path: ["get-session"] }),
  });

  for (const cookie of response.headers.getSetCookie()) {
    responseHeaders.append("Set-Cookie", cookie);
  }
  const session = response.ok ? await response.json().catch(() => null) : null;
  if (session?.user?.id && session?.session?.id) {
    responseHeaders.set("Location", "/dashboard");
  }
  return new Response(null, { status: 303, headers: responseHeaders });
}
