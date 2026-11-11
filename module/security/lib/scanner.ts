import type { ParsedDiffFile } from "@/module/github/lib/diff";
import type { FindingSeverity } from "@/module/review/lib/insights";

export interface ScanFinding {
  severity: FindingSeverity;
  category: "security";
  title: string;
  detail: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface DependencyChange {
  name: string;
  version: string;
  ecosystem: "npm" | "PyPI";
  file: string;
  line: number;
}

interface SecretPattern {
  label: string;
  regex: RegExp;
  severity: FindingSeverity;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { label: "AWS access key ID", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, severity: "critical" },
  { label: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, severity: "critical" },
  { label: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/, severity: "critical" },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: "critical" },
  { label: "Slack token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, severity: "critical" },
  { label: "Stripe live secret key", regex: /\b[sr]k_live_[0-9A-Za-z]{20,}\b/, severity: "critical" },
  { label: "Razorpay live key", regex: /\brzp_live_[0-9A-Za-z]{10,}\b/, severity: "critical" },
  {
    label: "private key",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
    severity: "critical",
  },
  {
    label: "database connection string with credentials",
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s"'`]+/,
    severity: "critical",
  },
  {
    label: "JSON Web Token",
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    severity: "high",
  },
];

const GENERIC_SECRET =
  /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i;

const PLACEHOLDER =
  /(?:example|placeholder|changeme|change[_-]me|your[_-]|<[^>]+>|x{4,}|\*{4,}|dummy|sample|\$\{|process\.env|env\.|localhost)/i;

const LOCAL_ONLY_PASSWORDS = /:(?:password|pass|postgres|root|admin|secret|test)@/i;

const SKIP_ALL = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock)$/;
const SKIP_GENERIC = /(?:\.(?:md|mdx|txt|lock|snap)$|(?:^|\/)(?:__tests__|tests?|mocks?|fixtures?|examples?|samples?|docs?)\/|\.(?:test|spec)\.)/i;

const ENV_FILE = /(?:^|\/)\.env(?:\.[\w-]+)?$/;
const ENV_TEMPLATE = /\.(?:example|sample|template|dist)$/;
const KEY_FILE = /(?:^|\/)(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)$|\.(?:pem|p12|pfx|keystore)$/;

function mask(value: string): string {
  if (value.length <= 8) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export function scanDiffForSecrets(files: ParsedDiffFile[]): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const file of files) {
    if (file.isDeleted || SKIP_ALL.test(file.path)) continue;

    if (file.isNew && ENV_FILE.test(file.path) && !ENV_TEMPLATE.test(file.path)) {
      findings.push({
        severity: "high",
        category: "security",
        title: "Environment file added to the repository",
        detail: `${file.path} is a new environment file. These usually contain secrets and should not be committed.`,
        file: file.path,
        suggestion: "Remove the file from git, add it to .gitignore and commit a .env.example with placeholder values instead.",
      });
    }

    if (file.isNew && KEY_FILE.test(file.path)) {
      findings.push({
        severity: "critical",
        category: "security",
        title: "Key or certificate file added to the repository",
        detail: `${file.path} looks like a private key or keystore.`,
        file: file.path,
        suggestion: "Remove it from git history, rotate the key and load it from a secret manager.",
      });
    }

    for (const added of file.addedLines) {
      const text = added.text;
      if (text.length > 600) continue;

      let matched = false;

      for (const pattern of SECRET_PATTERNS) {
        const match = pattern.regex.exec(text);
        if (!match) continue;
        if (PLACEHOLDER.test(match[0])) continue;
        if (pattern.label.startsWith("database") && LOCAL_ONLY_PASSWORDS.test(match[0])) continue;

        findings.push({
          severity: pattern.severity,
          category: "security",
          title: `Possible ${pattern.label} committed`,
          detail: `A value that looks like a ${pattern.label} (${mask(match[0])}) was added to ${file.path}. If it is real, treat it as leaked.`,
          file: file.path,
          line: added.line,
          suggestion: "Rotate the credential, remove it from the commit history and read it from an environment variable or secret manager.",
        });
        matched = true;
        break;
      }

      if (matched || SKIP_GENERIC.test(file.path)) continue;

      const generic = GENERIC_SECRET.exec(text);
      if (generic && !PLACEHOLDER.test(generic[1]) && !/^(.)\1+$/.test(generic[1])) {
        findings.push({
          severity: "high",
          category: "security",
          title: "Hard-coded credential",
          detail: `A literal secret value (${mask(generic[1])}) is assigned in ${file.path}.`,
          file: file.path,
          line: added.line,
          suggestion: "Move the value to an environment variable or secret manager.",
        });
      }
    }
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings: ScanFinding[]): ScanFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const NPM_DEPENDENCY =
  /^\s*"(@?[a-z0-9][\w.@/-]*)"\s*:\s*"[\^~><=\s]*(\d+\.\d+\.\d+(?:[-+][\w.]+)?)"\s*,?\s*$/;
const NPM_NON_DEPENDENCY_KEYS = new Set(["version", "node", "npm", "yarn", "pnpm", "name"]);
const PIP_PIN = /^\s*([A-Za-z0-9][\w.-]*)\s*==\s*(\d[\w.]*)\s*(?:#.*)?$/;

export function extractDependencyChanges(files: ParsedDiffFile[]): DependencyChange[] {
  const changes: DependencyChange[] = [];

  for (const file of files) {
    if (file.isDeleted) continue;
    const base = file.path.split("/").pop() ?? "";

    if (base === "package.json") {
      for (const added of file.addedLines) {
        const match = NPM_DEPENDENCY.exec(added.text);
        if (!match || NPM_NON_DEPENDENCY_KEYS.has(match[1])) continue;
        changes.push({ name: match[1], version: match[2], ecosystem: "npm", file: file.path, line: added.line });
      }
    } else if (/^requirements[\w.-]*\.txt$/.test(base)) {
      for (const added of file.addedLines) {
        const match = PIP_PIN.exec(added.text);
        if (!match) continue;
        changes.push({ name: match[1], version: match[2], ecosystem: "PyPI", file: file.path, line: added.line });
      }
    }
  }

  return changes;
}
