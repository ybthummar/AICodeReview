import dotenv from "dotenv";
dotenv.config();

import { reviewPullRequest } from "../module/ai/actions/index";

async function main() {
  const owner = process.argv[2];
  const repo = process.argv[3];
  const prNumber = parseInt(process.argv[4] || "1", 10);

  if (!owner || !repo) {
    console.log("Usage: node scripts/test-review.js <owner> <repo> [prNumber]");
    console.log("Example: npx tsx scripts/test-review.ts octocat Hello-World 1");
    process.exit(1);
  }

  console.log(`🚀 Triggering AI review for ${owner}/${repo}#${prNumber}...`);

  try {
    const result = await reviewPullRequest(owner, repo, prNumber);
    console.log("✅ Result:", result);
    console.log("👉 Go to http://localhost:3000/dashboard/reviews to see the review card!");
  } catch (error) {
    console.error("❌ Review failed:", error);
  }
}

main();
