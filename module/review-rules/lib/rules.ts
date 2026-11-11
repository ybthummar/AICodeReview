import type { ParsedDiffFile } from "@/module/github/lib/diff";
import {
  CATEGORIES,
  SEVERITIES,
  type FindingCategory,
  type FindingSeverity,
} from "@/module/review/lib/insights";

export const RULE_PACK_IDS = ["owasp", "hygiene"] as const;
export type RulePackId = (typeof RULE_PACK_IDS)[number];

export interface CustomRule {
  id: string;
  name: string;
  pattern: string;
  ignoreCase: boolean;
  severity: FindingSeverity;
  category: FindingCategory;
  message: string;
  // Lower-case file extensions without the dot. Empty means every file.
  extensions: string[];
}

interface BuiltinRule extends Omit<CustomRule, "id" | "ignoreCase"> {
  id: string;
  ignoreCase?: boolean;
}

export const MAX_CUSTOM_RULES = 20;
const MAX_PATTERN_LENGTH = 200;
const MAX_LINE_LENGTH = 400;
const MAX_SCANNED_LINES = 8000;
const MAX_RULE_FINDINGS = 25;

const SCRIPT_EXTENSIONS = ["js", "jsx", "ts", "tsx", "mjs", "cjs"];

export const RULE_PACKS: Record<RulePackId, { label: string; description: string; rules: BuiltinRule[] }> = {
  owasp: {
    label: "OWASP security checks",
    description: "Dynamic code execution, XSS sinks, command and SQL injection, weak crypto and disabled TLS checks.",
    rules: [
      {
        id: "owasp-eval",
        name: "Dynamic code execution",
        pattern: "\\b(?:eval|new\\s+Function)\\s*\\(",
        severity: "high",
        category: "security",
        message: "eval and new Function run arbitrary strings as code. Parse data instead, or use a safe lookup table.",
        extensions: SCRIPT_EXTENSIONS,
      },
      {
        id: "owasp-xss",
        name: "Unsafe HTML injection",
        pattern: "\\.innerHTML\\s*=|dangerouslySetInnerHTML|document\\.write\\(",
        severity: "medium",
        category: "security",
        message: "Writing raw HTML can enable cross-site scripting. Sanitise the value or render text instead.",
        extensions: SCRIPT_EXTENSIONS,
      },
      {
        id: "owasp-command-injection",
        name: "Shell command built from strings",
        pattern: "\\b(?:exec|execSync)\\s*\\(\\s*[`\"'][^`\"']*(?:\\$\\{|[\"']\\s*\\+)",
        severity: "high",
        category: "security",
        message: "Interpolating values into a shell command allows command injection. Use execFile with an argument array.",
        extensions: SCRIPT_EXTENSIONS,
      },
      {
        id: "owasp-sql-injection",
        name: "SQL built with string concatenation",
        pattern: "\\b(?:SELECT|INSERT|UPDATE|DELETE)\\b[^;\\n]*(?:\\$\\{|[\"'`]\\s*\\+\\s*\\w)",
        ignoreCase: true,
        severity: "high",
        category: "security",
        message: "Concatenating values into SQL allows injection. Use parameterised queries.",
        extensions: [...SCRIPT_EXTENSIONS, "py", "java", "php", "rb", "go"],
      },
      {
        id: "owasp-weak-hash",
        name: "Weak hash algorithm",
        pattern: "createHash\\(\\s*['\"](?:md5|sha1)['\"]\\s*\\)|hashlib\\.(?:md5|sha1)\\(",
        severity: "medium",
        category: "security",
        message: "MD5 and SHA-1 are broken for security purposes. Use SHA-256 or a password hashing function such as bcrypt or argon2.",
        extensions: [...SCRIPT_EXTENSIONS, "py"],
      },
      {
        id: "owasp-weak-random",
        name: "Predictable random value for a secret",
        pattern: "(?:token|secret|password|nonce|session|apikey)[^\\n]*Math\\.random\\(\\)|Math\\.random\\(\\)[^\\n]*(?:token|secret|password|nonce|session|apikey)",
        ignoreCase: true,
        severity: "medium",
        category: "security",
        message: "Math.random is not cryptographically secure. Use crypto.randomBytes or crypto.randomUUID.",
        extensions: SCRIPT_EXTENSIONS,
      },
      {
        id: "owasp-tls",
        name: "TLS verification disabled",
        pattern: "rejectUnauthorized\\s*:\\s*false|verify\\s*=\\s*False|NODE_TLS_REJECT_UNAUTHORIZED\\s*=\\s*['\"]?0",
        severity: "high",
        category: "security",
        message: "Disabling certificate checks exposes connections to interception. Fix the certificate instead.",
        extensions: [...SCRIPT_EXTENSIONS, "py"],
      },
      {
        id: "owasp-cors",
        name: "Wildcard CORS origin",
        pattern: "Access-Control-Allow-Origin['\"]?\\s*[:,]\\s*['\"]\\*['\"]|origin\\s*:\\s*['\"]\\*['\"]",
        severity: "medium",
        category: "security",
        message: "Allowing every origin lets any website call this API from a browser. List the origins you trust.",
        extensions: [...SCRIPT_EXTENSIONS, "py"],
      },
    ],
  },
  hygiene: {
    label: "Code hygiene",
    description: "Leftover debugging, swallowed errors, focused tests, loose typing and unresolved TODOs.",
    rules: [
      {
        id: "hygiene-console",
        name: "Debug logging left in code",
        pattern: "\\bconsole\\.(?:log|debug)\\(",
        severity: "low",
        category: "maintainability",
        message: "Remove debugging output or use the project's logger.",
        extensions: SCRIPT_EXTENSIONS,
      },
      {
        id: "hygiene-debugger",
        name: "Debugger statement",
        pattern: "^\\s*debugger\\s*;?\\s*$",
        severity: "medium",
        category: "bug",
        message: "A debugger statement pauses execution in browsers and Node inspectors.",
        extensions: SCRIPT_EXTENSIONS,
      },
      {
        id: "hygiene-empty-catch",
        name: "Swallowed error",
        pattern: "catch\\s*(?:\\([^)]*\\))?\\s*\\{\\s*\\}",
        severity: "medium",
        category: "bug",
        message: "An empty catch block hides failures. Handle or log the error.",
        extensions: [...SCRIPT_EXTENSIONS, "java", "cs", "php"],
      },
      {
        id: "hygiene-focused-test",
        name: "Focused test left in",
        pattern: "\\b(?:describe|it|test)\\.only\\(|\\b(?:fit|fdescribe)\\(",
        severity: "high",
        category: "testing",
        message: "A focused test makes the rest of the suite silently skip.",
        extensions: SCRIPT_EXTENSIONS,
      },
      {
        id: "hygiene-any",
        name: "Loose any type",
        pattern: ":\\s*any\\b|\\bas\\s+any\\b",
        severity: "low",
        category: "style",
        message: "any turns off type checking. Use a precise type or unknown.",
        extensions: ["ts", "tsx"],
      },
      {
        id: "hygiene-todo",
        name: "Unresolved TODO",
        pattern: "\\b(?:TODO|FIXME|HACK|XXX)\\b",
        severity: "info",
        category: "maintainability",
        message: "Track this in an issue so it does not get lost.",
        extensions: [],
      },
    ],
  },
};

// Rejects patterns that are likely to backtrack catastrophically, since users supply them.
function isSafePattern(pattern: string): boolean {
  if (/\([^)]*[*+][^)]*\)[*+{]/.test(pattern)) return false;
  if (/(?:\.\*|\.\+){2,}/.test(pattern)) return false;
  return true;
}

export function validateCustomRule(raw: unknown): CustomRule | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 60) : "";
  const pattern = typeof obj.pattern === "string" ? obj.pattern.trim() : "";
  const message = typeof obj.message === "string" ? obj.message.trim().slice(0, 200) : "";

  if (!name || !pattern || pattern.length > MAX_PATTERN_LENGTH || !isSafePattern(pattern)) return null;

  try {
    new RegExp(pattern);
  } catch {
    return null;
  }

  const extensions = Array.isArray(obj.extensions)
    ? Array.from(
        new Set(
          obj.extensions
            .filter((e): e is string => typeof e === "string")
            .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
            .filter((e) => /^[a-z0-9]{1,8}$/.test(e))
        )
      ).slice(0, 10)
    : [];

  return {
    id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim().slice(0, 40) : `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    pattern,
    ignoreCase: obj.ignoreCase === true,
    severity: SEVERITIES.includes(obj.severity as FindingSeverity) ? (obj.severity as FindingSeverity) : "medium",
    category: CATEGORIES.includes(obj.category as FindingCategory) ? (obj.category as FindingCategory) : "maintainability",
    message: message || `Matched the custom rule "${name}".`,
    extensions,
  };
}

export function normalizeCustomRules(raw: unknown): CustomRule[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map(validateCustomRule)
    .filter((rule): rule is CustomRule => rule !== null)
    .slice(0, MAX_CUSTOM_RULES);
}

export function normalizeRulePacks(raw: unknown): RulePackId[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((p): p is RulePackId => RULE_PACK_IDS.includes(p as RulePackId))));
}

export interface RuleFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  detail: string;
  file: string;
  line: number;
  suggestion?: string;
  source: "rule";
}

interface CompiledRule {
  rule: BuiltinRule | CustomRule;
  regex: RegExp;
}

export function runRules(
  files: ParsedDiffFile[],
  config: { rulePacks: RulePackId[]; customRules: CustomRule[] }
): RuleFinding[] {
  const rules: (BuiltinRule | CustomRule)[] = [
    ...config.rulePacks.flatMap((pack) => RULE_PACKS[pack].rules),
    ...config.customRules,
  ];
  if (rules.length === 0) return [];

  const compiled: CompiledRule[] = [];
  for (const rule of rules) {
    try {
      compiled.push({ rule, regex: new RegExp(rule.pattern, rule.ignoreCase ? "i" : "") });
    } catch {
      // Invalid patterns are skipped instead of failing the review.
    }
  }

  const findings: RuleFinding[] = [];
  let scanned = 0;

  for (const file of files) {
    if (file.isDeleted) continue;
    const ext = file.path.split(".").pop()?.toLowerCase() ?? "";

    for (const { rule, regex } of compiled) {
      if (rule.extensions.length > 0 && !rule.extensions.includes(ext)) continue;

      const hits: number[] = [];
      for (const added of file.addedLines) {
        if (++scanned > MAX_SCANNED_LINES * compiled.length) return findings;
        if (added.text.length > MAX_LINE_LENGTH) continue;
        if (regex.test(added.text)) hits.push(added.line);
      }

      if (hits.length === 0) continue;

      findings.push({
        severity: rule.severity,
        category: rule.category,
        title: rule.name,
        detail:
          hits.length > 1
            ? `${rule.message} Found on ${hits.length} added lines in ${file.path}.`
            : rule.message,
        file: file.path,
        line: hits[0],
        source: "rule",
      });

      if (findings.length >= MAX_RULE_FINDINGS) return findings;
    }
  }

  return findings;
}
