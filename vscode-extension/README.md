# RepoPilot for VS Code

Reviews your uncommitted or staged changes with RepoPilot and shows the findings in the Problems panel.

## Setup

1. Open RepoPilot, go to Settings, and create an API key.
2. In VS Code run `RepoPilot: Set API Key` and paste it. The key is stored in the editor's secret storage.
3. Set `repopilot.serverUrl` if your server is not at `http://localhost:3000`.

## Commands

- `RepoPilot: Review Uncommitted Changes` reviews `git diff HEAD`.
- `RepoPilot: Review Staged Changes` reviews `git diff --cached`.
- `RepoPilot: Clear Findings` removes the diagnostics.

## Install from source

No build step is needed. Run `npx @vscode/vsce package` inside this folder and install the generated `.vsix`, or open this folder in VS Code and press `F5` to start an Extension Development Host.

New, untracked files are not part of `git diff`. Stage them with `git add -N <file>` (intent to add) to include them.
