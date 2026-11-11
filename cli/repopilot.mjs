#!/usr/bin/env node
// RepoPilot command line client. Requires Node 18 or newer and git. No dependencies.
//
//   repopilot review [--base main] [--staged] [--fail-on high] [--strictness balanced] [--json]
//   repopilot whoami
//
// Environment:
//   REPOPILOT_API_KEY   key created in Settings > API keys
//   REPOPILOT_URL       server address, default http://localhost:3000

import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const SEVERITIES = ["info", "low", "medium", "high", "critical"];
const COLORS = {
  critical: "\x1b[1;31m",
  high: "\x1b[31m",
  medium: "\x1b[33m",
  low: "\x1b[36m",
  info: "\x1b[2m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (color, text) => (useColor ? `${COLORS[color]}${text}${COLORS.reset}` : text);

function usage(exitCode = 0) {
  console.log(`RepoPilot CLI

Usage:
  repopilot review [options]   Review your local changes before you push
  repopilot whoami             Show the account and plan behind your API key

Review options:
  --base <ref>         Compare against <ref> (for example main). Default: uncommitted changes vs HEAD
  --staged             Review only staged changes
  --fail-on <level>    Exit with code 1 when a finding is at or above this severity
                       (info, low, medium, high, critical). Default: high
  --strictness <level> lenient, balanced or strict
  --json               Print the raw JSON response
  -h, --help           Show this help

Environment:
  REPOPILOT_API_KEY    API key from Settings > API keys (required)
  REPOPILOT_URL        Server address (default http://localhost:3000)`);
  process.exit(exitCode);
}

function parseArguments(argv) {
  const options = { command: argv[0], base: null, staged: false, failOn: "high", strictness: null, json: false };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next) fail(`Missing value for ${arg}`);
      return next;
    };

    if (arg === "--base") options.base = value();
    else if (arg === "--staged") options.staged = true;
    else if (arg === "--fail-on") options.failOn = value();
    else if (arg === "--strictness") options.strictness = value();
    else if (arg === "--json") options.json = true;
    else if (arg === "-h" || arg === "--help") usage(0);
    else fail(`Unknown option ${arg}`);
  }

  return options;
}

function fail(message) {
  console.error(paint("critical", "error:"), message);
  process.exit(2);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    fail(`git ${args.join(" ")} failed: ${detail}`);
  }
}

function collectDiff(options) {
  if (options.base && !/^[\w./~^-]+$/.test(options.base)) fail("The --base value contains unsupported characters.");
  if (options.base && options.base.startsWith("-")) fail("The --base value must be a branch, tag or commit.");

  if (options.staged) return git(["diff", "--cached", "--no-color"]);
  if (options.base) return git(["diff", "--no-color", `${options.base}...HEAD`]);

  // Uncommitted changes, falling back to an initial repository without HEAD.
  try {
    return execFileSync("git", ["diff", "HEAD", "--no-color"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return git(["diff", "--no-color"]);
  }
}

function endpoint(path) {
  const base = (process.env.REPOPILOT_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

async function call(path, init = {}) {
  const key = process.env.REPOPILOT_API_KEY;
  if (!key) fail("Set REPOPILOT_API_KEY. Create a key in Settings > API keys.");

  let response;
  try {
    response = await fetch(endpoint(path), {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
  } catch (error) {
    fail(`Could not reach ${endpoint(path)}: ${error.message}`);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non JSON error pages are reported below.
  }

  if (!response.ok) {
    fail(body?.error || `The server answered with HTTP ${response.status}`);
  }

  return body;
}

async function whoami() {
  const me = await call("/api/v1/me");
  console.log(`${paint("bold", me.name)} <${me.email}>  plan: ${me.plan}`);
  for (const item of me.usage) {
    console.log(`  ${item.kind}: ${item.used}${item.limit === null ? " (unlimited)" : ` / ${item.limit}`}`);
  }
}

async function review(options) {
  if (!SEVERITIES.includes(options.failOn)) fail(`--fail-on must be one of: ${SEVERITIES.join(", ")}`);

  const diff = collectDiff(options);
  if (!diff.trim()) {
    console.log("No changes to review.");
    return;
  }

  const repo = basename(git(["rev-parse", "--show-toplevel"]).trim());
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();

  console.error(paint("info", `Reviewing ${diff.split("\n").length} diff lines from ${repo} (${branch})...`));

  const result = await call("/api/v1/review", {
    method: "POST",
    body: JSON.stringify({
      diff,
      repo,
      title: `Local changes on ${branch}`,
      ...(options.strictness ? { strictness: options.strictness } : {}),
    }),
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${paint("bold", "Verdict:")} ${result.verdict}   ${paint("bold", "Risk:")} ${result.riskLevel} (${result.riskScore}/100)`);
    console.log(`Quality ${result.qualityScore}  Security ${result.securityScore}`);
    if (result.summary) console.log(`\n${result.summary}`);

    if (result.findings.length === 0) {
      console.log(`\n${paint("bold", "No findings.")}`);
    }

    for (const finding of result.findings) {
      const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "";
      console.log(`\n${paint(finding.severity, finding.severity.toUpperCase().padEnd(8))} ${finding.title}  ${paint("info", location)}`);
      if (finding.detail) console.log(`         ${finding.detail}`);
      if (finding.suggestion) console.log(`         Suggestion: ${finding.suggestion}`);
      if (finding.fix) console.log(`         Replace with: ${finding.fix.trim()}`);
    }
  }

  const threshold = SEVERITIES.indexOf(options.failOn);
  const blocking = result.findings.filter((finding) => SEVERITIES.indexOf(finding.severity) >= threshold);

  if (blocking.length > 0) {
    console.error(paint("high", `\n${blocking.length} finding(s) at or above "${options.failOn}".`));
    process.exit(1);
  }
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") usage(argv.length === 0 ? 2 : 0);

const options = parseArguments(argv);

if (options.command === "review") await review(options);
else if (options.command === "whoami") await whoami();
else fail(`Unknown command "${options.command}". Run repopilot --help.`);
