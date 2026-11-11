// Pure unified-diff helpers shared by the scanner, inline reviewer and ignore rules.

export interface ParsedDiffFile {
  path: string;
  text: string;
  // Lines added in the new version of the file.
  addedLines: { line: number; text: string }[];
  // New-file line numbers GitHub allows review comments on (added + context lines).
  visibleLines: Set<number>;
  // Text of every visible line, used to verify a suggestion still matches the file.
  lineText: Map<number, string>;
  additions: number;
  deletions: number;
  isNew: boolean;
  isDeleted: boolean;
}

interface FileBuilder {
  path: string;
  oldPath: string;
  textLines: string[];
  addedLines: { line: number; text: string }[];
  visibleLines: Set<number>;
  lineText: Map<number, string>;
  additions: number;
  deletions: number;
  isNew: boolean;
  isDeleted: boolean;
  headerDone: boolean;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function newBuilder(path: string): FileBuilder {
  return {
    path,
    oldPath: "",
    textLines: [],
    addedLines: [],
    visibleLines: new Set(),
    lineText: new Map(),
    additions: 0,
    deletions: 0,
    isNew: false,
    isDeleted: false,
    headerDone: false,
  };
}

export function normalizeDiffPath(path: string): string {
  return path.trim().replace(/^(?:\.\/|a\/|b\/)/, "");
}

export function parseUnifiedDiff(diff: string): ParsedDiffFile[] {
  const builders: FileBuilder[] = [];
  let current: FileBuilder | null = null;
  let inHunk = false;
  let oldRemaining = 0;
  let newRemaining = 0;
  let newLine = 0;

  const startFile = (path: string): FileBuilder => {
    const builder = newBuilder(path);
    builders.push(builder);
    return builder;
  };

  for (const raw of diff.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

    if (inHunk && current) {
      if (line.startsWith("\\")) {
        current.textLines.push(raw);
        continue;
      }

      if (oldRemaining > 0 || newRemaining > 0) {
        const marker = line[0];
        if (marker === "+") {
          newRemaining -= 1;
          current.addedLines.push({ line: newLine, text: line.slice(1) });
          current.visibleLines.add(newLine);
          current.lineText.set(newLine, line.slice(1));
          current.additions += 1;
          newLine += 1;
        } else if (marker === "-") {
          oldRemaining -= 1;
          current.deletions += 1;
        } else {
          oldRemaining -= 1;
          newRemaining -= 1;
          current.visibleLines.add(newLine);
          current.lineText.set(newLine, line.slice(1));
          newLine += 1;
        }

        current.textLines.push(raw);
        if (oldRemaining <= 0 && newRemaining <= 0) inHunk = false;
        continue;
      }

      inHunk = false;
    }

    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      current = startFile(match ? match[2] : "");
      current.textLines.push(raw);
      continue;
    }

    if (line.startsWith("--- ")) {
      if (!current || current.headerDone) current = startFile("");

      const match = /^--- (?:a\/)?(.*)$/.exec(line);
      const oldPath = match ? match[1].trim() : "";
      if (oldPath === "/dev/null") current.isNew = true;
      else current.oldPath = oldPath;
      current.textLines.push(raw);
      continue;
    }

    if (line.startsWith("+++ ") && current) {
      const match = /^\+\+\+ (?:b\/)?(.*)$/.exec(line);
      const newPath = match ? match[1].trim() : "";
      if (newPath === "/dev/null") {
        current.isDeleted = true;
        current.path = current.path || current.oldPath;
      } else if (newPath) {
        current.path = newPath;
      }
      current.headerDone = true;
      current.textLines.push(raw);
      continue;
    }

    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      if (!current) current = startFile("");

      oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
      newLine = Number(hunk[3]);
      inHunk = oldRemaining > 0 || newRemaining > 0;
      current.headerDone = true;
      current.textLines.push(raw);
      continue;
    }

    if (current) current.textLines.push(raw);
  }

  return builders
    .filter((b) => b.path)
    .map((b) => ({
      path: normalizeDiffPath(b.path),
      text: b.textLines.join("\n"),
      addedLines: b.addedLines,
      visibleLines: b.visibleLines,
      lineText: b.lineText,
      additions: b.additions,
      deletions: b.deletions,
      isNew: b.isNew,
      isDeleted: b.isDeleted,
    }));
}

export function filterDiffByIgnoredPaths(
  diff: string,
  isIgnored: (path: string) => boolean
): { diff: string; files: ParsedDiffFile[]; ignoredFiles: string[] } {
  const all = parseUnifiedDiff(diff);
  const kept = all.filter((f) => !isIgnored(f.path));

  return {
    diff: kept.map((f) => f.text).join("\n"),
    files: kept,
    ignoredFiles: all.filter((f) => isIgnored(f.path)).map((f) => f.path),
  };
}
