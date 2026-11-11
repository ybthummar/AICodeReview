// Shared by the GitHub file fetcher and the vector indexer so both agree on what is searchable.
export const INDEXABLE_EXTENSIONS = [
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "go", "java", "kt", "rs",
  "c", "cpp", "h", "cs", "php", "rb", "swift",
  "sql", "prisma", "md",
] as const;

export const SYMBOL_PARSER_EXTENSIONS = ["js", "ts", "jsx", "tsx", "py", "go", "java"];

export const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  "dist",
  "build",
  ".cache",
  "coverage",
  "__pycache__",
  ".turbo",
  ".output",
  "vendor",
  "public",
  ".idea",
  ".vscode",
  "generated",
]);

export const MAX_INDEXED_FILES = 400;
export const MAX_INDEXED_FILE_BYTES = 150_000;

const LOCKFILE = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/;
const MINIFIED = /\.min\.(?:js|css)$/;

export function isIndexablePath(path: string): boolean {
  const segments = path.split("/");
  const fileName = segments[segments.length - 1];

  if (segments.slice(0, -1).some((segment) => IGNORED_DIRECTORIES.has(segment))) return false;
  if (LOCKFILE.test(path) || MINIFIED.test(fileName)) return false;

  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;
  return Boolean(ext) && (INDEXABLE_EXTENSIONS as readonly string[]).includes(ext as string);
}
