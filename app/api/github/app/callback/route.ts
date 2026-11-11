import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { APP_BASE_URL } from "@/lib/app-url";
import { verifyInstallState } from "@/module/github/lib/app";
import { InstallationLinkError, linkInstallation } from "@/module/github/lib/installations";

// GitHub redirects here (the app's "Setup URL") after someone installs or updates the app.
export async function GET(req: NextRequest) {
  const settingsUrl = new URL("/dashboard/settings", APP_BASE_URL);

  const redirectWith = (status: "linked" | "error", message?: string) => {
    settingsUrl.searchParams.set("github_app", status);
    if (message) settingsUrl.searchParams.set("message", message.slice(0, 200));
    return NextResponse.redirect(settingsUrl);
  };

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", APP_BASE_URL));
    }

    const installationId = Number(req.nextUrl.searchParams.get("installation_id"));
    const stateUserId = verifyInstallState(req.nextUrl.searchParams.get("state"));

    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
      return redirectWith("error", "GitHub did not send an installation id.");
    }

    if (!stateUserId || stateUserId !== session.user.id) {
      return redirectWith("error", "The installation link expired. Start again from Settings.");
    }

    await linkInstallation(session.user.id, installationId);
    return redirectWith("linked");
  } catch (error) {
    if (error instanceof InstallationLinkError) {
      return redirectWith("error", error.message);
    }

    console.error("GitHub App callback failed:", error);
    return redirectWith("error", "Could not link the GitHub App installation.");
  }
}
