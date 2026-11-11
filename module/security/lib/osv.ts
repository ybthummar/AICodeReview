import { parseUnifiedDiff, type ParsedDiffFile } from "@/module/github/lib/diff";
import {
  extractDependencyChanges,
  scanDiffForSecrets,
  type DependencyChange,
  type ScanFinding,
} from "@/module/security/lib/scanner";
import type { FindingSeverity } from "@/module/review/lib/insights";

const OSV_BASE = "https://api.osv.dev/v1";
const MAX_DEPENDENCIES = 40;
const MAX_DETAIL_LOOKUPS = 12;
const REQUEST_TIMEOUT_MS = 6000;

interface OsvQueryResult {
  vulns?: { id: string }[];
}

interface OsvVulnerability {
  id: string;
  summary?: string;
  database_specific?: { severity?: string };
}

function mapSeverity(value: string | undefined): FindingSeverity {
  switch (value?.toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "LOW":
      return "low";
    default:
      return "medium";
  }
}

const SEVERITY_RANK: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

async function fetchVulnerability(id: string): Promise<OsvVulnerability | null> {
  try {
    const res = await fetch(`${OSV_BASE}/vulns/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as OsvVulnerability) : null;
  } catch {
    return null;
  }
}

export async function findVulnerableDependencies(
  dependencies: DependencyChange[]
): Promise<ScanFinding[]> {
  const targets = dependencies.slice(0, MAX_DEPENDENCIES);
  if (targets.length === 0) return [];

  let results: OsvQueryResult[];
  try {
    const res = await fetch(`${OSV_BASE}/querybatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: targets.map((d) => ({
          package: { name: d.name, ecosystem: d.ecosystem },
          version: d.version,
        })),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    results = ((await res.json()) as { results?: OsvQueryResult[] }).results ?? [];
  } catch (error) {
    console.warn("OSV dependency lookup failed:", error);
    return [];
  }

  const findings: ScanFinding[] = [];
  let lookups = 0;

  for (let i = 0; i < targets.length; i++) {
    const vulns = results[i]?.vulns ?? [];
    if (vulns.length === 0) continue;

    const dependency = targets[i];
    const details: OsvVulnerability[] = [];

    for (const vuln of vulns.slice(0, 3)) {
      if (lookups >= MAX_DETAIL_LOOKUPS) break;
      lookups += 1;
      const detail = await fetchVulnerability(vuln.id);
      if (detail) details.push(detail);
    }

    const severity =
      details
        .map((d) => mapSeverity(d.database_specific?.severity))
        .sort((a, b) => SEVERITY_RANK.indexOf(a) - SEVERITY_RANK.indexOf(b))[0] ?? "high";

    const ids = vulns.slice(0, 4).map((v) => v.id).join(", ");
    const summary = details.find((d) => d.summary)?.summary;

    findings.push({
      severity,
      category: "security",
      title: `Vulnerable dependency: ${dependency.name}@${dependency.version}`,
      detail: `${vulns.length} known ${vulns.length === 1 ? "advisory" : "advisories"} (${ids})${summary ? `: ${summary}` : "."}`,
      file: dependency.file,
      line: dependency.line,
      suggestion: "Upgrade to a patched release and re-run the audit.",
    });
  }

  return findings;
}

export interface SecurityScanResult {
  findings: ScanFinding[];
  filesScanned: number;
  dependenciesChecked: number;
}

export async function runSecurityScan(
  input: string | ParsedDiffFile[]
): Promise<SecurityScanResult> {
  const files = typeof input === "string" ? parseUnifiedDiff(input) : input;
  const dependencies = extractDependencyChanges(files);

  const [secretFindings, dependencyFindings] = await Promise.all([
    Promise.resolve(scanDiffForSecrets(files)),
    findVulnerableDependencies(dependencies),
  ]);

  return {
    findings: [...secretFindings, ...dependencyFindings],
    filesScanned: files.length,
    dependenciesChecked: Math.min(dependencies.length, MAX_DEPENDENCIES),
  };
}
