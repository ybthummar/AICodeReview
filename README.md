# RepoPilot : AICodeReviewer

AICodeReview is a developer-focused web application that automates repository analytics and AI-assisted code review workflows. It combines a modern Next.js UI, background job processing, AI retrieval-augmented-generation (RAG) with a vector store, GitHub integrations, subscription billing via Razorpay, and a Prisma-backed relational database to provide teams with automated summaries, review suggestions, and searchable repository context.

## Key features

- Automated weekly repository summaries and scheduled review dispatching (background jobs).
- AI-assisted review generation using embeddings + vector search for relevant context.
- AI Review Insights: every review carries a verdict, risk score, quality/security ratings and severity-tagged findings, aggregated in the dashboard Code Health card.
- GitHub quality gate (PRO): a `RepoPilot / AI Review` commit status is published on each reviewed pull request.
- Inline PR comments with one-click GitHub suggested changes, only for lines that exist in the diff.
- Finding tracking: findings fixed between runs are detected automatically; findings can be resolved or dismissed by hand.
- Security scan on every review: leaked secrets in added lines and new dependencies checked against the OSV database.
- Per-repository review rules: strictness, focus areas, ignored paths, custom instructions, auto-review toggle, walkthrough toggle, built-in rule packs (OWASP, code hygiene) and your own regex rules.
- PR walkthrough: per-file summaries and a Mermaid diagram added to the review comment.
- One-click auto-fix: open a fix pull request or commit a suggested replacement to the PR branch (the line is re-checked first; fork PRs are refused).
- Feedback loop: thumbs up or down on findings feeds a review-accuracy score, and repeatedly rejected low-severity findings are suppressed per repository.
- Slash commands in PR comments (`/review`, `/describe [apply]`, `/ask <question>`, `/ignore`, `/help`). Needs `GITHUB_WEBHOOK_SECRET`; only owners, members and collaborators can run them.
- Engineering analytics (`/dashboard/analytics`): cycle time, time to first review, per-author risk, riskiest files, merges with open high-severity findings.
- GitHub App install flow (Settings): short-lived installation tokens preferred over personal OAuth tokens.
- API keys (Settings), a zero-dependency CLI (`cli/repopilot.mjs`) and a VS Code extension (`vscode-extension/`) for reviewing local changes before you push.
- Audit log and exports (`/dashboard/audit`): activity history, findings CSV and a printable weekly or monthly report.
- PRO subscriptions run for 30 days per payment, can be extended, and a daily job downgrades expired accounts and sends a renewal reminder three days ahead.
- Ask your codebase: RAG chat with file and line citations (`/dashboard/chat`).
- AI Toolkit includes PR descriptions, unit tests, release notes, security scans, and GitHub issue investigation (`/dashboard/toolkit`).
- Team workspaces with Owner / Admin / Member / Viewer roles and shared repositories (`/dashboard/team`).
- Slack, Discord and Microsoft Teams alerts for completed reviews (Settings).
- Free-plan monthly quotas with a usage meter (reviews, codebase questions, toolkit runs).
- GitHub integrations (OAuth / App) and webhook handling for repo events.
- User authentication, repository management and per-user dashboards.
- Subscription billing and checkout flows via Razorpay.
- Background processing and event orchestration using Inngest.

## High-level architecture

- Frontend: Next.js (app router) — UI, public pages, and protected dashboard under `app/`.
- API & server: Next.js API routes (under `app/api/`) for webhooks, Razorpay checkout endpoints, and server actions.
- Background workers: `inngest/functions/` implements scheduled tasks and async review pipelines.
- Database: Prisma with a relational DB (Postgres recommended) for users, repos, reviews, and subscriptions.
- Vector store: Pinecone (or equivalent) stores embeddings for repository content to enable RAG lookups.
- AI layer: `module/ai/` contains the retrieval + generation pipeline that composes prompts with retrieved context.
- Integrations include GitHub, Razorpay, and Google Gemini.

## Tech stack

- Framework: Next.js + TypeScript
- Styling: Tailwind CSS
- ORM: Prisma (Postgres / compatible)
- Vector DB: Pinecone
- Background jobs / orchestration: Inngest
- AI / LLM uses Gemini for embeddings and Gemini, Deploy DeepSeek, Z.AI GLM, and OpenAI for text generation.
- Payments: Razorpay

## Repository overview (where to look)

- UI & routes: `app/` (root pages, auth flows, and `app/dashboard/`)
- Reusable components: `components/` and `components/ui/`
- Background jobs / functions: `inngest/functions/`
- AI code & RAG helpers: `module/ai/` and `lib/pinecone.ts`
- GitHub helpers: `module/github/lib/github.ts`
- Review & repository domain logic: `module/review/`, `module/repository/`
- Database schema & migrations: `prisma/schema.prisma` and `prisma/migrations/`
- Server utilities and integrations: `lib/` (e.g., `lib/db.ts`, `lib/razorpay.ts`, `lib/auth.ts`)

## Getting started (local development)

Use Node.js 22.12 or newer on the 22.x line, or Node.js 24 or newer.

1. Clone the repository and install dependencies:

```bash
git clone <repo-url>
cd AICodeReview
npm install
```

2. Create the main environment file and the single local-development override:

```powershell
Copy-Item .env.example .env
Copy-Item .env.development.example .env.development
```

Put deployment values in Vercel's Environment Variables. For local work, fill in `.env.development` with a reachable PostgreSQL database and development/test credentials; it overrides `.env` while running `npm run dev`. GitHub sign-in uses the app's Better Auth database; email/password sign-up uses Neon Managed Auth. Restart the dev server after changing env values. Do not use production credentials locally. Both files are ignored by Git.

The local GitHub OAuth callback defaults to `http://localhost:3000/api/auth/callback/github`. If port 3000 is occupied and Next.js starts on another port, set `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_APP_BASE_URL` to that exact local origin and update the development OAuth app callback to match. The configured auth URL is used when generating the callback.

If a Vercel environment pull created `.env.local`, Next.js reads it before `.env.development`. Copy `.env.development` to `.env.development.local` and keep local URLs, database, OAuth credentials, and any other development-only values there so they override production values. `NEON_AUTH_COOKIE_SECRET` is an application secret and must be at least 32 characters; keep it in an ignored env file and set a separate value in Vercel. Restart the dev server after changing env files.

The login page proxies email/password requests through `/api/neon-auth` and reads the active user from `/api/app-session`; GitHub OAuth remains on `/api/auth`. To provision Managed Auth, run `neon login`, link the requested project/branch, then run `neon deploy`. Because this project has a root `.env`, Neon CLI pulls its Auth URL into `.env`; keep the local cookie secret in `.env.development.local`. The configured production branch stores sign-ups as production users.

The login page shows an error code and recovery guidance when GitHub sign-in fails. A `state_mismatch` means the callback could not be tied to the initiating browser. An `invalid_code` means the token exchange failed. GitHub's token endpoint can give a more specific reason in the server logs. Search for `[auth/github]` to see whether the request failed at sign-in or on the callback. When GitHub itself displays a callback warning, compare its registered callback with the configured origin plus `/api/auth/callback/github`. [GitHub OAuth token exchange errors](https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/troubleshooting-oauth-app-access-token-request-errors)

For Docker Compose, run `docker compose --env-file .env.development up --build`; Compose uses the same local file for build-time configuration and container runtime values.

Use `.env.example` as the single Vercel Environment Variables checklist. Set secrets in Vercel, not in a committed file. Configure `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the canonical active production origin. Set `NEON_AUTH_BASE_URL` from the linked Neon branch and a unique `NEON_AUTH_COOKIE_SECRET` in Vercel. The production GitHub OAuth callback must be exactly `<production-app-url>/api/auth/callback/github`.

The Razorpay price is configured as `RAZORPAY_PRO_AMOUNT=14900` with `RAZORPAY_CURRENCY=INR`; Razorpay amounts are in paise, so this is INR 149. Keep this non-secret setting separate from Razorpay credentials.

RepoPilot uses `gemini-embedding-001` for repository indexing and for search queries from codebase chat and reviews. Set `PINECONE_GOOGLE_INDEX` to an index for that model. The app reads the index dimension and requests matching vectors from Gemini. `PINECONE_NAMESPACE` is optional. The app detects the Pinecone API mode and uses its default namespace when the variable is empty. Schema-based indexes use `X-Pinecone-Api-Version: 2026-07`.

When migrating from Bedrock Titan, point `PINECONE_GOOGLE_INDEX` at the existing Gemini index or a new dense cosine index. Use **Re-index** in codebase chat for repositories missing from the Gemini index. Existing vectors from `gemini-embedding-001` in the configured index and namespace can be reused.

Text generation tries Gemini, Deploy DeepSeek V4.1 Flash, Z.AI GLM-4.7-Flash, then OpenAI Responses with GPT-6 Luna. Each provider is enabled by its server-side API key. The app also accepts `GLM_ACCESS_KEY` and `OPEN_AI_API_KEY` as aliases. Set `DEPLOY_MODEL`, `GLM_MODEL`, or `OPENAI_TEXT_MODEL` to override a default model. This order applies to PR reviews, codebase chat, Toolkit generation, and client summaries. [Z.AI model pricing](https://docs.z.ai/guides/overview/pricing) · [GPT-6 Luna availability and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna)

In **AI Toolkit → Issue Investigation**, members can choose a connected repository and an issue number. RepoPilot reads the issue, discussion, and available index excerpts using the workspace's repository access. Configure `OPENAI_ISSUE_AGENT_ID` and an OpenAI project key with Agents API access to use the saved agent. Agent sessions can search the web for public repositories. The report appears in the Toolkit and can be copied. If the saved agent is unavailable, the Toolkit uses the text-generation fallbacks. [OpenAI Agents API setup](https://developers.openai.com/api/docs/guides/agents-api/quickstart)

3. Generate Prisma client and run migrations (dev). Two migrations must be applied before starting the app: `20261111120000_add_rules_teams_notifications` (review rules, workspaces, alert channels) and `20261111180000_add_expiry_feedback_keys_audit` (subscription expiry and payments, finding feedback, API keys, audit log, GitHub App installations):

```bash
npx prisma generate
npx prisma migrate dev
```

Optional quota overrides (defaults shown):

```
FREE_MONTHLY_REVIEW_LIMIT=10
FREE_MONTHLY_CHAT_LIMIT=30
FREE_MONTHLY_TOOLKIT_LIMIT=20
```

4. Start the dev server:

```bash
npm run dev
# or: pnpm dev | yarn dev
```

Open `http://localhost:3000`.

## Running background workers & handling webhooks

- Background functions live under `inngest/functions/` — use Inngest's local runner or deploy the worker as a serverless function according to Inngest docs.
- For local webhook testing (Razorpay / GitHub), use a tunneling tool (e.g., `ngrok`) and configure provider dashboard webhook URLs and secrets to match your `app/api/*` webhook endpoints.

## Development commands (common)

```bash
npm run dev        # start Next.js dev server
npm run build      # build for production
npm run start      # run production server
npx prisma generate
npx prisma migrate dev
npx tsc --noEmit    # typecheck
npm run lint        # run linter (if configured)
```

Check `package.json` for exact script names used in this repo.

## Tests & quality

- Add unit & integration tests as needed. If no test runner is configured, consider adding `vitest` or `jest` for React/unit tests.
- Keep TypeScript strictness and lint rules enabled.

## Deployment

- App: Vercel is recommended for seamless Next.js deployments. Set environment variables in the Vercel project settings.
- Authentication: Neon Managed Auth handles email/password sign-up; the existing Better Auth configuration continues to handle GitHub OAuth. Set the Managed Auth URL and cookie secret in Vercel, and register `<production-app-url>/api/auth/callback/github` with GitHub. Use a separate development OAuth app if the production app only accepts the production callback.
- Repository indexing: configure and serve the Inngest endpoint at `/api/inngest`, with `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` set in the app environment. Connect and Re-index queue durable Inngest jobs; they do not run as detached Next.js requests. Indexing embeds file chunks and symbols, upserts the new vectors before removing stale ones, and fails visibly rather than replacing an index after incomplete GitHub fetches or failed embedding/Pinecone writes. Indexing is capped at 400 eligible files per repository.
- Prisma migrations: use `npx prisma migrate deploy` in your deployment pipeline.
- Background jobs: deploy Inngest workers or use Inngest serverless configuration.
- Webhooks: configure production webhook endpoints and verify signatures using secrets stored in environment variables.

## Security & best practices

- Keep development credentials in the ignored `.env.development` file and deployment credentials in Vercel's Environment Variables. Do not commit populated `.env` files, put credentials in Docker build arguments, or copy local env files into a Docker image.
- `.env.example` and `.env.development.example` are the only committed environment templates; they contain placeholders/defaults, not credentials.
- Validate webhook signatures (Razorpay/GitHub) in `app/api/*` endpoints.
- Use minimal permissions for GitHub tokens (only the scopes required).

## Troubleshooting

- Prisma client issues: run `npx prisma generate`.
- For Pinecone errors, verify `PINECONE_API_KEY` (or `PINECOIN_DB_API_KEY`), `PINECONE_GOOGLE_INDEX`, and index readiness.
- Webhook testing locally: use `ngrok` and ensure webhook secrets match.

## Extending the project

- Add seed data scripts for dev databases and sample embeddings.
- Add E2E tests for webhook flows and review generation.
- Add observability: error reporting, job retries, and visibility into background tasks.

## Contributing

- Fork, branch, and open pull requests. Follow the existing code style (TypeScript + Tailwind + React patterns).
- Include tests and ensure type/lint checks pass.

## License

Add a `LICENSE` file at the repository root to state your desired license (MIT, Apache-2.0, etc.).

## Acknowledgements

Built with Next.js, Prisma, Gemini, Pinecone, Inngest, Tailwind, and Razorpay.

----

If you'd like, I can also:

- Scan the codebase to extract the exact environment variables used and insert them into this `README.md`.
- Add a small `scripts/` folder with `dev` helpers (ngrok + worker runner) for local testing.

Tell me which of those you'd like and I'll proceed.
