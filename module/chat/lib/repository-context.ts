import { CodebaseAnswerError, type RepositoryContext } from "@/module/chat/lib/answer";
import { getInstallationTokenForRepository } from "@/module/github/lib/app";
import { openGitHubRepository } from "@/module/github/lib/github";
import { isGitHubAccessError, isGitHubRateLimit } from "@/module/github/lib/read-errors";
import { getGitHubTokenForUser } from "@/module/team/lib/access";

const MAX_CANDIDATE_FILES = 16;
const MAX_EXCERPT_CHARS = 2_800;
const MAX_EXCERPT_LINES = 80;
const COMMON_WORDS = new Set(
  "about again are can code could does file find from give handled have how into know like me more project repository should show tell that the their them there these this those use uses want what when where which who why will with work would you".split(" "),
);
const ENTRY_POINT = /(?:^|\/)(?:index|main|server|app)\.[^/]+$/i;
const ROOT_README = /^readme\.md$/i;

function words(text: string) {
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function matchingTerms(text: string, terms: Set<string>) {
  return new Set(words(text).filter((word) => terms.has(word)));
}

function relevance(path: string, query: string, terms: Set<string>) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const namedInQuestion = query.includes(path.toLowerCase()) || query.includes(name.toLowerCase());
  const pathScore = matchingTerms(path, terms).size * 5 + matchingTerms(name, terms).size * 3;
  const entryScore = ROOT_README.test(path) ? 3 : Number(ENTRY_POINT.test(path));
  return (namedInQuestion ? 40 : 0) + pathScore + entryScore;
}

function excerpt(content: string, terms: Set<string>) {
  const lines = content.split(/\r?\n/);
  const matches = new Set<string>();
  let bestLine = 0;
  let bestScore = 0;

  for (const [index, line] of lines.entries()) {
    const found = matchingTerms(line, terms);
    for (const word of found) matches.add(word);
    if (found.size > bestScore) {
      bestLine = index;
      bestScore = found.size;
    }
  }

  // Keep the matching line in the excerpt even when nearby lines are long.
  let start = bestLine;
  let leadingChars = 0;
  while (start > 0 && bestLine - start < 20 && leadingChars + lines[start - 1].length < 900) {
    leadingChars += lines[--start].length + 1;
  }

  return {
    score: matches.size * 3 + bestScore,
    startLine: start + 1,
    content: lines.slice(start, start + MAX_EXCERPT_LINES).join("\n").slice(0, MAX_EXCERPT_CHARS),
  };
}

export async function loadGitHubRepositoryContext(
  repository: { owner: string; name: string; userId: string; githubId: bigint },
  viewerId: string,
  question: string,
): Promise<RepositoryContext | null> {
  const { owner, name, userId } = repository;
  const credentials = [
    () => getInstallationTokenForRepository(owner, name),
    () => getGitHubTokenForUser(userId),
    ...(viewerId !== userId ? [() => getGitHubTokenForUser(viewerId)] : []),
  ];
  const tried = new Set<string>();

  // Public repositories can also be read without a token.
  for (const getCredential of [...credentials, null]) {
    const token = getCredential ? await getCredential() : null;
    if (getCredential && !token) continue;
    if (token && tried.has(token)) continue;
    if (token) tried.add(token);

    try {
      const source = await openGitHubRepository(token, repository);
      if (!source) return null;

      const query = question.toLowerCase();
      const terms = new Set(words(question).filter((word) => word.length >= 3 && !COMMON_WORDS.has(word)));
      if (terms.has("authentication")) terms.add("auth");
      if (terms.has("database")) terms.add("db");

      const candidates = source.files
        .map((file) => ({ file, score: relevance(file.path, query, terms) }))
        .sort((a, b) => b.score - a.score || a.file.path.length - b.file.path.length)
        .slice(0, MAX_CANDIDATE_FILES);
      const pathScores = new Map(candidates.map(({ file, score }) => [file.path, score]));
      const files = await source.readFiles(candidates.map(({ file }) => file));
      const matches = files
        .filter(({ content }) => content.trim())
        .map(({ path, content }) => {
          const snippet = excerpt(content, terms);
          return { path, ...snippet, score: snippet.score + (pathScores.get(path) ?? 0) };
        })
        .sort((a, b) => b.score - a.score);

      return { fullName: source.fullName, revision: source.revision, matches };
    } catch (cause) {
      if (isGitHubAccessError(cause)) continue;
      if (isGitHubRateLimit(cause)) {
        throw new CodebaseAnswerError("GitHub is limiting repository requests. Wait a moment and try again.", { cause });
      }
      throw new CodebaseAnswerError("Could not load the repository files from GitHub. Try again in a moment.", { cause });
    }
  }

  throw new CodebaseAnswerError(
    "GitHub denied access to this repository. Reauthorize GitHub or check that the GitHub App can read repository contents.",
  );
}
