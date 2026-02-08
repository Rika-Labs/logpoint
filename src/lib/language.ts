import { extname } from "node:path";

export const SupportedLanguages = [
  "javascript",
  "typescript",
  "python",
  "go",
  "ruby",
  "shell",
  "java",
  "csharp",
  "php",
  "rust",
  "kotlin",
] as const;

export type Language = (typeof SupportedLanguages)[number];

const extensionMap: Readonly<Record<string, Language>> = {
  ".js": "javascript",
  ".cjs": "javascript",
  ".mjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".go": "go",
  ".rb": "ruby",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".ksh": "shell",
  ".java": "java",
  ".cs": "csharp",
  ".php": "php",
  ".rs": "rust",
  ".kt": "kotlin",
  ".kts": "kotlin",
};

export const isLanguage = (value: string): value is Language =>
  (SupportedLanguages as readonly string[]).includes(value);

export const detectLanguage = (filePath: string): Language => {
  const extension = extname(filePath).toLowerCase();
  return extensionMap[extension] ?? "javascript";
};
