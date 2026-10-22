const AST_SERVICE_URL = process.env.AST_SERVICE_URL || "";

/**
 * Simple regex-based fallback parser that extracts function and class
 * declarations from JavaScript/TypeScript source code. This is used when
 * the external AST service is unavailable or not configured.
 */
function localFallbackParse(code: string, extension: string) {
  const symbols: {
    type: "function" | "class";
    name: string;
    code: string;
    startLine: number;
    endLine: number;
  }[] = [];

  if (!["js", "ts", "jsx", "tsx"].includes(extension)) {
    return { symbols };
  }

  const lines = code.split("\n");

  // Match function declarations, arrow functions, and class declarations
  const patterns = [
    // function declarations: function name(...)
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    // const/let/var arrow functions: const name = (...) =>
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?.*?\)?\s*=>/,
    // class declarations: class Name
    /(?:export\s+)?(?:default\s+)?class\s+(\w+)/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1];
        const isClass = pattern.source.includes("class");

        // Find the end of the block by counting braces
        let braceCount = 0;
        let foundOpen = false;
        let endLine = i;

        for (let j = i; j < lines.length; j++) {
          for (const char of lines[j]) {
            if (char === "{") {
              braceCount++;
              foundOpen = true;
            } else if (char === "}") {
              braceCount--;
            }
          }
          if (foundOpen && braceCount <= 0) {
            endLine = j;
            break;
          }
          // Safety limit: don't scan more than 200 lines for a single symbol
          if (j - i > 200) {
            endLine = j;
            break;
          }
        }

        const codeBlock = lines.slice(i, endLine + 1).join("\n");

        symbols.push({
          type: isClass ? "class" : "function",
          name,
          code: codeBlock,
          startLine: i + 1,
          endLine: endLine + 1,
        });

        break; // Only match one pattern per line
      }
    }
  }

  return { symbols };
}

export async function parseWithASTService(code: string, extension: string) {
  // If AST service URL is configured, try the external service first
  if (AST_SERVICE_URL) {
    try {
      const res = await fetch(AST_SERVICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, extension }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (res.ok) {
        return res.json();
      }

      console.warn(
        `AST service returned ${res.status}, falling back to local parser`
      );
    } catch (error) {
      console.warn("AST service unavailable, falling back to local parser:", error);
    }
  }

  // Fallback: use local regex-based parser
  return localFallbackParse(code, extension);
}
