import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isNeonAuthConfigured } from "@/lib/neon-auth";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json(null, { headers: { "Cache-Control": "no-store" } });
  }

  const user = session.user;
  return Response.json({
    provider: session.authProvider,
    emailAuthEnabled: isNeonAuthConfigured(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      subscriptionTier:
        "subscriptionTier" in user && typeof user.subscriptionTier === "string"
          ? user.subscriptionTier
          : null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
