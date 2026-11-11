import { normalizeDiffPath, type ParsedDiffFile } from "@/module/github/lib/diff";
import type { Walkthrough } from "@/module/review/lib/insights";

const MAX_FILES = 25;

// Line counts come from the real diff; the model only supplies one-line summaries and the diagram.
export function buildWalkthrough(
  fromModel: Walkthrough | undefined,
  files: ParsedDiffFile[]
): Walkthrough | undefined {
  if (files.length === 0) return fromModel?.diagram ? { files: [], diagram: fromModel.diagram } : undefined;

  const summaries = new Map(
    (fromModel?.files ?? []).map((f) => [normalizeDiffPath(f.path), f.summary])
  );

  const findSummary = (path: string) => {
    const direct = summaries.get(path);
    if (direct !== undefined) return direct;

    for (const [key, value] of summaries) {
      if (path.endsWith(`/${key}`) || key.endsWith(`/${path}`)) return value;
    }
    return "";
  };

  const rows = [...files]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, MAX_FILES)
    .map((file) => ({
      path: file.path,
      summary: findSummary(file.path),
      additions: file.additions,
      deletions: file.deletions,
    }));

  return fromModel?.diagram ? { files: rows, diagram: fromModel.diagram } : { files: rows };
}
