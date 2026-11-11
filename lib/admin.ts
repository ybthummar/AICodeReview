export const ADMIN_EMAILS = [
  "yugthummar001@gmail.com",
];

// GitHub display names are user-controlled and not unique, so only the account
// email and the explicit ADMIN tier are trusted for admin access.
export function isAdminUser(user?: {
  email?: string | null;
  name?: string | null;
  subscriptionTier?: string | null;
} | null): boolean {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();

  if (ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase() === email)) {
    return true;
  }

  if (user.subscriptionTier === "ADMIN") {
    return true;
  }

  return false;
}
