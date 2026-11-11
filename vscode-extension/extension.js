// RepoPilot for VS Code. Plain CommonJS, no build step and no dependencies.
// Uses the global fetch available in VS Code 1.82+ (Node 18+).
const vscode = require("vscode");
const path = require("node:path");
const { execFile } = require("node:child_process");

const SECRET_KEY = "repopilot.apiKey";
const MAX_BUFFER = 64 * 1024 * 1024;

const SEVERITY_MAP = {
  critical: vscode.DiagnosticSeverity.Error,
  high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning,
  low: vscode.DiagnosticSeverity.Information,
  info: vscode.DiagnosticSeverity.Hint,
};

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).toString().trim()));
      else resolve(stdout.toString());
    });
  });
}

async function getApiKey(context, prompt) {
  let key = await context.secrets.get(SECRET_KEY);

  if (!key && prompt) {
    key = await vscode.window.showInputBox({
      title: "RepoPilot API key",
      prompt: "Paste a key from RepoPilot Settings > API keys",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().startsWith("rp_live_") ? null : "Keys start with rp_live_"),
    });

    if (key) {
      key = key.trim();
      await context.secrets.store(SECRET_KEY, key);
    }
  }

  return key;
}

async function review(context, diagnostics, output, staged) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage("Open a folder that is a git repository first.");
    return;
  }

  const key = await getApiKey(context, true);
  if (!key) return;

  const cwd = folder.uri.fsPath;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "RepoPilot is reviewing your changes", cancellable: false },
    async () => {
      let diff;
      try {
        diff = staged ? await git(cwd, ["diff", "--cached", "--no-color"]) : await git(cwd, ["diff", "HEAD", "--no-color"]);
      } catch (error) {
        vscode.window.showErrorMessage(`Could not read the git diff: ${error.message}`);
        return;
      }

      if (!diff.trim()) {
        vscode.window.showInformationMessage("RepoPilot: there are no changes to review.");
        return;
      }

      // Paths in a git diff are relative to the repository root, which can be above the opened folder.
      let root = cwd;
      try {
        root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim() || cwd;
      } catch {
        // Keep the workspace folder.
      }

      const config = vscode.workspace.getConfiguration("repopilot");
      const serverUrl = String(config.get("serverUrl") || "http://localhost:3000").replace(/\/+$/, "");

      let response;
      try {
        response = await fetch(`${serverUrl}/api/v1/review`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            diff,
            repo: path.basename(cwd),
            title: "Local changes",
            strictness: config.get("strictness"),
          }),
        });
      } catch (error) {
        vscode.window.showErrorMessage(`RepoPilot could not reach ${serverUrl}: ${error.message}`);
        return;
      }

      let body = null;
      try {
        body = await response.json();
      } catch {
        // Handled by the status check below.
      }

      if (response.status === 401) {
        await context.secrets.delete(SECRET_KEY);
        vscode.window.showErrorMessage("RepoPilot rejected the API key. Run RepoPilot: Set API Key.");
        return;
      }

      if (!response.ok) {
        vscode.window.showErrorMessage(`RepoPilot: ${body?.error || `HTTP ${response.status}`}`);
        return;
      }

      diagnostics.clear();
      const byFile = new Map();
      const general = [];

      for (const finding of body.findings) {
        const line = Math.max(0, (finding.line || 1) - 1);
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
          [finding.title, finding.detail, finding.suggestion ? `Suggestion: ${finding.suggestion}` : ""]
            .filter(Boolean)
            .join("\n"),
          SEVERITY_MAP[finding.severity] ?? vscode.DiagnosticSeverity.Information
        );
        diagnostic.source = "RepoPilot";
        diagnostic.code = finding.category;

        if (!finding.file) {
          general.push(finding);
          continue;
        }

        const list = byFile.get(finding.file) ?? [];
        list.push(diagnostic);
        byFile.set(finding.file, list);
      }

      for (const [file, list] of byFile) {
        diagnostics.set(vscode.Uri.file(path.join(root, file)), list);
      }

      output.clear();
      output.appendLine(`Verdict: ${body.verdict}   Risk: ${body.riskLevel} (${body.riskScore}/100)`);
      output.appendLine(`Quality ${body.qualityScore}   Security ${body.securityScore}`);
      if (body.summary) output.appendLine(`\n${body.summary}`);
      for (const finding of general) {
        output.appendLine(`\n[${finding.severity}] ${finding.title}\n  ${finding.detail}`);
      }

      const total = body.findings.length;
      const message =
        total === 0
          ? `RepoPilot: no findings. Verdict ${body.verdict}.`
          : `RepoPilot: ${total} finding${total === 1 ? "" : "s"} (${body.riskLevel} risk). See the Problems panel.`;

      const choice = await vscode.window.showInformationMessage(message, "Show details");
      if (choice === "Show details") output.show(true);
    }
  );
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("repopilot");
  const output = vscode.window.createOutputChannel("RepoPilot");

  context.subscriptions.push(
    diagnostics,
    output,
    vscode.commands.registerCommand("repopilot.reviewChanges", () => review(context, diagnostics, output, false)),
    vscode.commands.registerCommand("repopilot.reviewStaged", () => review(context, diagnostics, output, true)),
    vscode.commands.registerCommand("repopilot.setApiKey", async () => {
      await context.secrets.delete(SECRET_KEY);
      if (await getApiKey(context, true)) vscode.window.showInformationMessage("RepoPilot API key saved.");
    }),
    vscode.commands.registerCommand("repopilot.clearFindings", () => diagnostics.clear())
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
