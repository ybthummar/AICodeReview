export const ADMIN_EMAILS = [
  "yugthummar001@gmail.com",
];

export const ADMIN_GITHUB_USERNAMES = [
  "ybthummar",
];

export function isAdminUser(user?: {
  email?: string | null;
  name?: string | null;
  subscriptionTier?: string | null;
} | null): boolean {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();
  const name = (user.name || "").toLowerCase().trim();

  if (ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase() === email)) {
    return true;
  }

  if (
    ADMIN_GITHUB_USERNAMES.some(
      (adminUsername) => adminUsername.toLowerCase() === name
    )
  ) {
    return true;
  }

  if (user.subscriptionTier === "ADMIN") {
    return true;
  }

  return false;
}
