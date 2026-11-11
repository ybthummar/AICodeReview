import type { FindingCategory } from "@/module/review/lib/insights";
import { CATEGORIES } from "@/module/review/lib/insights";
import {
  normalizeCustomRules,
  normalizeRulePacks,
  type CustomRule,
  type RulePackId,
} from "@/module/review-rules/lib/rules";

export const STRICTNESS_LEVELS = ["lenient", "balanced", "strict"] as const;
export type Strictness = (typeof STRICTNESS_LEVELS)[number];

export interface ReviewConfig {
  strictness: Strictness;
  focusAreas: FindingCategory[];
  ignoredPaths: string[];
  customInstructions: string;
  autoReview: boolean;
  inlineComments: boolean;
  securityScan: boolean;
  walkthrough: boolean;
  rulePacks: RulePackId[];
  customRules: CustomRule[];
}

export const DEFAULT_IGNORED_PATHS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "**/*.min.js",
  "**/*.map",
  "dist/**",
  "build/**",
  ".next/**",
];

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  strictness: "balanced",
  focusAreas: [],
  ignoredPaths: DEFAULT_IGNORED_PATHS,
  customInstructions: "",
  autoReview: true,
  inlineComments: true,
  securityScan: true,
  walkthrough: true,
  rulePacks: [],
  customRules: [],
};

export const STRICTNESS_DESCRIPTIONS: Record<Strictness, string> = {
  lenient: "Only blocking problems: likely bugs, security issues and data loss.",
  balanced: "Correctness, security and meaningful maintainability concerns.",
  strict: "Everything above plus missing tests, error handling gaps and style issues.",
};

const MAX_IGNORED_PATTERNS = 40;

export function normalizeReviewConfig(raw: unknown): ReviewConfig {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const strictness = STRICTNESS_LEVELS.includes(obj.strictness as Strictness)
    ? (obj.strictness as Strictness)
    : DEFAULT_REVIEW_CONFIG.strictness;

  const focusAreas = Array.isArray(obj.focusAreas)
    ? Array.from(
        new Set(
          obj.focusAreas.filter((a): a is FindingCategory =>
            CATEGORIES.includes(a as FindingCategory)
          )
        )
      )
    : [];

  const ignoredPaths = Array.isArray(obj.ignoredPaths)
    ? Array.from(
        new Set(
          obj.ignoredPaths
            .filter((p): p is string => typeof p === "string")
            .map((p) => p.trim())
            .filter((p) => p.length > 0 && p.length <= 200)
        )
      ).slice(0, MAX_IGNORED_PATTERNS)
    : DEFAULT_IGNORED_PATHS;

  return {
    strictness,
    focusAreas,
    ignoredPaths,
    customInstructions:
      typeof obj.customInstructions === "string" ? obj.customInstructions.trim().slice(0, 1000) : "",
    autoReview: typeof obj.autoReview === "boolean" ? obj.autoReview : true,
    inlineComments: typeof obj.inlineComments === "boolean" ? obj.inlineComments : true,
    securityScan: typeof obj.securityScan === "boolean" ? obj.securityScan : true,
    walkthrough: typeof obj.walkthrough === "boolean" ? obj.walkthrough : true,
    rulePacks: normalizeRulePacks(obj.rulePacks),
    customRules: normalizeCustomRules(obj.customRules),
  };
}

function globToRegExp(pattern: string): RegExp {
  let source = "";

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (char === "*") {
      if (pattern[i + 1] === "*") {
        const followedBySlash = pattern[i + 2] === "/";
        source += followedBySlash ? "(?:.*/)?" : ".*";
        i += followedBySlash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }

  return new RegExp(`^${source}$`);
}

export function pathMatchesPattern(path: string, rawPattern: string): boolean {
  let pattern = rawPattern.trim().replace(/^\.\//, "");
  if (!pattern) return false;

  if (pattern.endsWith("/")) pattern = `${pattern}**`;

  const regex = globToRegExp(pattern);
  if (regex.test(path)) return true;

  // Patterns without a slash match the file name anywhere, like .gitignore.
  if (!pattern.includes("/")) {
    return regex.test(path.split("/").pop() ?? path);
  }

  return false;
}

export function createIgnoreMatcher(patterns: string[]): (path: string) => boolean {
  return (path) => patterns.some((pattern) => pathMatchesPattern(path, pattern));
}

export function buildRulesPrompt(config: ReviewConfig): string {
  const strictness: Record<Strictness, string> = {
    lenient:
      "Review mode: LENIENT. Only report issues likely to cause bugs, security problems or data loss. Do not report style or naming nitpicks.",
    balanced:
      "Review mode: BALANCED. Report correctness, security and meaningful maintainability concerns. Skip trivial style comments.",
    strict:
      "Review mode: STRICT. Be thorough: also report missing tests, weak error handling, and style inconsistencies as low or info findings.",
  };

  const lines = [strictness[config.strictness]];

  if (config.focusAreas.length > 0) {
    lines.push(`Prioritise these areas: ${config.focusAreas.join(", ")}.`);
  }

  if (config.customInstructions) {
    lines.push(
      `Team guidelines (follow them unless they conflict with correctness or safety):\n${config.customInstructions}`
    );
  }

  return lines.join("\n");
}
