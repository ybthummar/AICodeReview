import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { escapeHtml } from "@/lib/mail";
import { parseReviewContent } from "@/module/review/lib/insights";

export type RepoInput = {
  id: string;
  name: string;
  fullName: string;
  reviews: {
    prTitle: string;
    prNumber: number;
    review: string;
    createdAt: Date;
  }[];
};

// Kept out of the "use server" actions file so it is not exposed as a public endpoint.
export async function generateRepoSummary(repo: RepoInput) {
  try {
    const parsedReviews = repo.reviews.map((r) => ({
      ...r,
      ...parseReviewContent(r.review),
    }));

    const reviewContext =
      parsedReviews.length === 0
        ? "No recent pull request reviews available."
        : parsedReviews
            .map(
              (r, i) =>
                `${i + 1}. PR #${r.prNumber} - ${r.prTitle}\nReview: ${r.markdown}`
            )
            .join("\n\n");

    const scored = parsedReviews.flatMap((r) => (r.insights ? [r.insights] : []));
    const metrics =
      scored.length === 0
        ? ""
        : `\nMeasured review metrics (use these as the basis for your scores):\n- Average quality score: ${Math.round(
            scored.reduce((sum, i) => sum + i.qualityScore, 0) / scored.length
          )}\n- Average security score: ${Math.round(
            scored.reduce((sum, i) => sum + i.securityScore, 0) / scored.length
          )}\n`;

    const prompt = `
You are a senior software architect and security reviewer.

Analyze the repository below and generate a WEEKLY CLIENT-FACING SUMMARY.

Repository:
- Name: ${repo.fullName}

Recent Pull Request Reviews:
${reviewContext}
${metrics}
Your task:
1. Summarize the latest implemented features (client-friendly, non-technical tone).
2. Give a SECURITY SCORE from 0 to 100.
3. Give a CODE QUALITY SCORE from 0 to 100.
4. List 3 to 5 clear improvement suggestions.

Rules:
- Be concise.
- Do NOT mention internal tooling.
- Do NOT expose vulnerabilities explicitly.
- Scores must be integers.
- Output MUST be valid JSON in the exact structure below.

Output JSON format:
{
  "summary": string,
  "securityScore": number,
  "codeQualityScore": number,
  "improvements": string[]
}
`;

    const { text } = await generateText({
      model: google("gemini-flash-lite-latest"),
      temperature: 0.3,
      prompt,
    });

    let parsed;
    try {
      const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(cleanedText);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    return {
      raw: parsed,
      html: `
      <h2>Weekly Project Overview</h2>
      <p>${escapeHtml(String(parsed.summary ?? ""))}</p>

      <h3>Scores</h3>
      <ul>
        <li><b>Security:</b> ${Number(parsed.securityScore) || 0} / 100</li>
        <li><b>Code Quality:</b> ${Number(parsed.codeQualityScore) || 0} / 100</li>
      </ul>

      <h3>Recommended Improvements</h3>
      <ul>
        ${(Array.isArray(parsed.improvements) ? parsed.improvements : [])
          .map((i: unknown) => `<li>${escapeHtml(String(i))}</li>`)
          .join("")}
      </ul>
    `,
    };
  } catch (error) {
    console.error("Error while Generating Email Response:", error);
    throw error;
  }
}
