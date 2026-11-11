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
- AI Toolkit: PR description generator (can update the PR), unit-test generator, release notes, on-demand security scan (`/dashboard/toolkit`).
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
- Integrations: GitHub (API + webhooks), Razorpay (checkout + webhooks), and an LLM provider (OpenAI or other).

## Tech stack

- Framework: Next.js + TypeScript
- Styling: Tailwind CSS
- ORM: Prisma (Postgres / compatible)
- Vector DB: Pinecone
- Background jobs / orchestration: Inngest
- AI / LLM: Provider configurable via environment (OpenAI, etc.)
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

1. Clone the repository and install dependencies:

```bash
git clone <repo-url>
cd AICodeReview
npm install
```

2. Create an environment file `.env` at the project root with required variables. Example list (verify usage in `lib/` and `module/`):

```
DATABASE_URL=postgresql://user:pass@localhost:5432/aicodereview
NEXT_PUBLIC_VERCEL_URL=http://localhost:3000
PINECONE_API_KEY=
PINECONE_ENV=us-west1-gcp
PINECONE_INDEX=aicodereview
INNGEST_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET= # required: unsigned Razorpay webhooks are rejected
GITHUB_WEBHOOK_SECRET= # required for slash commands and recommended for webhook signing
GITHUB_TOKEN= # optional fallback
# Optional GitHub App (Settings > GitHub App). Set the app's Setup URL to <app url>/api/github/app/callback
# and its webhook URL to <app url>/api/webhooks/github with the same webhook secret.
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY= # PEM, newlines may be written as \n
GITHUB_APP_SLUG=
OPENAI_API_KEY= # or LLM provider key
NEXTAUTH_SECRET= # if using NextAuth or similar
```

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
- GitHub OAuth: use `http://localhost:3000/api/auth/callback/github` for local development and `<production-app-url>/api/auth/callback/github` in Vercel. Use a separate GitHub OAuth app for local development if the production app only allows the production callback. Development always uses `http://localhost:3000` as Better Auth's base URL; production uses `BETTER_AUTH_URL` or `NEXT_PUBLIC_APP_URL`.
- Prisma migrations: use `npx prisma migrate deploy` in your deployment pipeline.
- Background jobs: deploy Inngest workers or use Inngest serverless configuration.
- Webhooks: configure production webhook endpoints and verify signatures using secrets stored in environment variables.

## Security & best practices

- Do not commit `.env` or secrets to source control.
- Validate webhook signatures (Razorpay/GitHub) in `app/api/*` endpoints.
- Use minimal permissions for GitHub tokens (only the scopes required).

## Troubleshooting

- Prisma client issues: run `npx prisma generate`.
- Pinecone errors: verify `PINECONE_API_KEY`, `PINECONE_INDEX`, and index readiness.
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

Built with Next.js, Prisma, Pinecone, Inngest, Tailwind, and Razorpay. AI pipelines are provider-agnostic; configure an LLM key in your environment.

----

If you'd like, I can also:

- Scan the codebase to extract the exact environment variables used and insert them into this `README.md`.
- Add a small `scripts/` folder with `dev` helpers (ngrok + worker runner) for local testing.

Tell me which of those you'd like and I'll proceed.
