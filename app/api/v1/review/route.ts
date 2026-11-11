import { NextResponse } from "next/server";
import { authenticateApiKey, checkRateLimit } from "@/module/api-keys/lib/keys";
import { generateStructuredReview } from "@/module/ai/lib/review-generator";
import { consumeUsage, QuotaExceededError, refundUsage } from "@/module/billing/lib/usage";
import { DEFAULT_REVIEW_CONFIG, STRICTNESS_LEVELS, type Strictness } from "@/module/review-rules/lib/config";
import { finalizeInsights, prepareDiff } from "@/module/review/lib/pipeline";
import { getOpenFindings } from "@/module/review/lib/insights";

export const maxDuration = 120;

const MAX_BODY_CHARS = 400_000;

// Reviews a diff sent by the CLI or the editor extension. Nothing is stored or posted to GitHub.
export async function POST(request: Request) {
  const identity = await authenticateApiKey(request);
  if (!identity) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const limit = checkRateLimit(identity.keyId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "The diff is too large. Review a smaller change." }, { status: 413 });
  }

  let body: { diff?: unknown; title?: unknown; repo?: unknown; strictness?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "The request body must be JSON" }, { status: 400 });
  }

  if (typeof body.diff !== "string" || !body.diff.trim()) {
    return NextResponse.json({ error: "Send a unified diff in the \"diff\" field" }, { status: 400 });
  }

  const strictness: Strictness = STRICTNESS_LEVELS.includes(body.strictness as Strictness)
    ? (body.strictness as Strictness)
    : DEFAULT_REVIEW_CONFIG.strictness;
  const config = { ...DEFAULT_REVIEW_CONFIG, strictness, inlineComments: false };

  const prepared = prepareDiff(body.diff, config);
  if (!prepared.diff.trim()) {
    return NextResponse.json({ error: "There are no reviewable changes in this diff" }, { status: 422 });
  }

  try {
    await consumeUsage(identity.userId, "reviews");
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Could not check the review quota:", error);
    return NextResponse.json({ error: "Could not check your usage" }, { status: 500 });
  }

  try {
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 140) : "Local changes";
    const repo = typeof body.repo === "string" && body.repo.trim() ? body.repo.trim().slice(0, 100) : "local";

    const generated = await generateStructuredReview({
      owner: "local",
      repo,
      prNumber: 0,
      title,
      description: "",
      headRef: "",
      baseRef: "",
      commitsSummary: "",
      filesSummary: prepared.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join("\n"),
      diff: prepared.diff,
      astContext: [],
      config,
    });

    const insights = await finalizeInsights({
      insights: generated.insights,
      files: prepared.files,
      scanFiles: prepared.allFiles,
      config,
      previous: null,
      headSha: "",
    });

    return NextResponse.json({
      markdown: generated.markdown,
      verdict: insights?.verdict ?? "informational",
      riskLevel: insights?.riskLevel ?? null,
      riskScore: insights?.riskScore ?? null,
      qualityScore: insights?.qualityScore ?? null,
      securityScore: insights?.securityScore ?? null,
      summary: insights?.summary ?? "",
      findings: insights
        ? getOpenFindings(insights).map((f) => ({
            severity: f.severity,
            category: f.category,
            title: f.title,
            detail: f.detail,
            file: f.file ?? null,
            line: f.line ?? null,
            suggestion: f.suggestion ?? null,
            fix: f.fix ?? null,
            source: f.source,
          }))
        : [],
    });
  } catch (error) {
    console.error("API review failed:", error);
    await refundUsage(identity.userId, "reviews");
    return NextResponse.json({ error: "The AI review failed. Please try again." }, { status: 502 });
  }
}
