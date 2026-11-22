"use client";

import { createAuthClient } from "better-auth/react";
import { useQuery } from "@tanstack/react-query";
import { createAuthClient as createNeonAuthClient } from "@neon/auth";
import { BetterAuthReactAdapter } from "@neon/auth/react/adapters";

const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.BETTER_AUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

const legacyAuthClient = createAuthClient({ baseURL });
const neonAuthClient = createNeonAuthClient(`${baseURL}/api/neon-auth`, {
  adapter: BetterAuthReactAdapter(),
});

export const signIn = legacyAuthClient.signIn;
export const neonSignIn = neonAuthClient.signIn;
export const neonSignUp = neonAuthClient.signUp;
export const neonGetSession = neonAuthClient.getSession;

export type AppSession = {
  provider: "neon" | "legacy";
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    subscriptionTier: string | null;
  };
};

type SignOutOptions = Parameters<typeof legacyAuthClient.signOut>[0];

export async function signOut(
  options?: SignOutOptions,
  provider?: AppSession["provider"],
) {
  let neonError: unknown;

  if (provider !== "legacy") {
    try {
      const neonResult = await neonAuthClient.signOut();
      if (neonResult.error) neonError = neonResult.error;
    } catch (error) {
      neonError = error;
    }
  }

  const legacyResult = await legacyAuthClient.signOut(options);
  if (legacyResult.error) throw legacyResult.error;
  if (neonError) throw neonError;

  return legacyResult;
}

export function useSession() {
  const query = useQuery({
    queryKey: ["app-session"],
    retry: false,
    queryFn: async (): Promise<AppSession | null> => {
      const response = await fetch("/api/app-session", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not retrieve the current user.");
      return await response.json() as AppSession | null;
    },
  });

  return { ...query, data: query.data ?? null };
}
