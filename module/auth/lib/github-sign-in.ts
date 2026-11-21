const messages = {
  login_origin_mismatch: "This page and the configured GitHub callback are on different origins. Start sign-in on the configured site so your browser can return the verification cookie.",
  invalid_origin: "RepoPilot rejected the sign-in origin. Open the configured site and check that BETTER_AUTH_URL matches its protocol, hostname and port.",
  provider_not_found: "GitHub sign-in is not configured. The site operator should set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET for the same OAuth app and restart the server.",
  access_denied: "GitHub authorization was declined. Continue with GitHub again when you are ready to grant access.",
  redirect_uri_mismatch: "GitHub rejected the callback address. The site operator should register the callback shown below in the GitHub OAuth app.",
  incorrect_client_credentials: "GitHub rejected the OAuth app credentials. The site operator should check the client ID and secret for this deployment.",
  state_not_found: "GitHub returned without the sign-in state. Start a new sign-in from this page.",
  state_mismatch: "RepoPilot could not match the callback to this browser’s sign-in cookie. Retry in the same browser and allow cookies on this site.",
  please_restart_the_process: "The saved sign-in attempt expired or could not be retrieved. Start a fresh sign-in in this tab.",
  no_code: "GitHub returned without an authorization code. Start a new sign-in.",
  invalid_code: "RepoPilot could not exchange the authorization code with GitHub. Retry once. If it persists, the site operator should check the GitHub token exchange error, OAuth credentials and registered callback.",
  bad_verification_code: "GitHub rejected the authorization code. It may have expired or already been used. Start a fresh sign-in.",
  unable_to_get_user_info: "RepoPilot could not read your GitHub profile. Retry and check that the OAuth app can access your account.",
  email_not_found: "GitHub did not supply an email address. Verify your primary GitHub email and grant the requested email permission.",
  unverified_user_email: "GitHub requires a verified primary email for this sign-in. Verify your primary email in GitHub, then retry.",
  application_suspended: "GitHub has suspended this OAuth app. The site operator should check its status in GitHub.",
  account_not_linked: "RepoPilot could not link this GitHub account. Check your verified GitHub email or contact the site operator about the existing account.",
  unable_to_create_user: "RepoPilot could not save your account after GitHub authorization. The site operator should check the database and its migrations.",
  unable_to_create_session: "RepoPilot could not save your sign-in session. The site operator should check database availability and session table permissions.",
  database_unavailable: "RepoPilot could not connect to its sign-in database. The site operator should check DATABASE_URL and database availability.",
  database_schema_error: "The sign-in database is missing a required table or column. The site operator should check the configured database and apply the repository’s Prisma migrations.",
  database_access_denied: "The database rejected RepoPilot’s credentials or permissions. The site operator should check the database user in DATABASE_URL.",
  rate_limited: "There have been too many sign-in requests. Wait a minute and try again.",
  network_error: "Your browser could not reach RepoPilot to start sign-in. Check your connection and try again.",
  session_lookup_failed: "RepoPilot could not check your existing session. Retry, or ask the site operator to check the session database.",
  sign_in_failed: "RepoPilot could not start GitHub sign-in. Retry, or ask the site operator to check the sign-in logs.",
  callback_failed: "RepoPilot could not finish GitHub sign-in after the callback. Start a new sign-in, or ask the site operator to check the callback logs.",
};

export type GitHubSignInCode = keyof typeof messages;
export type SignInStage = "sign-in" | "callback";

export function signInMessage(code: GitHubSignInCode) {
  return messages[code];
}

export function signInCode(raw: unknown, stage: SignInStage, status?: number): GitHubSignInCode {
  const code = typeof raw === "string" ? raw.toLowerCase() : "";
  if (Object.hasOwn(messages, code)) return code as GitHubSignInCode;
  switch (code) {
    case "invalid_callbackurl":
    case "invalid_errorcallbackurl":
    case "invalid_callback_url":
    case "missing_or_null_origin":
      return "invalid_origin";
    case "oauth_provider_not_found": return "provider_not_found";
    case "unable_to_link_account": return "account_not_linked";
    case "failed_to_create_session": return "unable_to_create_session";
    default:
      if (status === 429) return "rate_limited";
      return stage === "sign-in" ? "sign_in_failed" : "callback_failed";
  }
}
