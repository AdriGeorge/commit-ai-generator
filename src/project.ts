import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import * as vscode from "vscode";
import { AppError, type ProjectSnapshot } from "./types";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache"
]);

const INCLUDED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".yml",
  ".yaml"
]);

const PRIORITY_FILES = [
  "package.json",
  "README.md",
  "src/extension.ts",
  "src/ai.ts",
  "src/prompt.ts",
  "src/webview.ts",
  "src/git.ts",
  "app/api/generate/route.ts"
];

const MAX_FILES = 24;
const MAX_FILE_CHARS = 2800;
const MAX_TOTAL_CHARS = 18000;

export function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];

  if (!folder) {
    throw new AppError("Open a workspace folder before running this command.", "no_workspace");
  }

  return folder.uri.fsPath;
}

function isIncludedFile(path: string): boolean {
  const lower = path.toLowerCase();

  if (lower === "package.json" || lower === "readme.md" || lower.endsWith(".env.example")) {
    return true;
  }

  return [...INCLUDED_EXTENSIONS].some((extension) => lower.endsWith(extension));
}

async function collectFiles(root: string, currentDir = root): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example" && entry.name !== ".gitignore") {
      if (entry.isDirectory()) {
        continue;
      }
    }

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await collectFiles(root, join(currentDir, entry.name))));
      continue;
    }

    const relativePath = relative(root, join(currentDir, entry.name));
    if (isIncludedFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function rankFiles(paths: string[]): string[] {
  return [...paths].sort((left, right) => {
    const leftPriority = PRIORITY_FILES.indexOf(left);
    const rightPriority = PRIORITY_FILES.indexOf(right);

    if (leftPriority >= 0 || rightPriority >= 0) {
      if (leftPriority === -1) {
        return 1;
      }

      if (rightPriority === -1) {
        return -1;
      }

      return leftPriority - rightPriority;
    }

    const leftDepth = left.split("/").length;
    const rightDepth = right.split("/").length;
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    return left.localeCompare(right);
  });
}

async function readSnippet(root: string, relativePath: string): Promise<string | null> {
  const absolutePath = join(root, relativePath);
  const fileStat = await stat(absolutePath);

  if (!fileStat.isFile() || fileStat.size === 0) {
    return null;
  }

  const raw = await readFile(absolutePath, "utf8");
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.length > MAX_FILE_CHARS
    ? `${trimmed.slice(0, MAX_FILE_CHARS)}\n...`
    : trimmed;
}

export async function createProjectSnapshot(root: string): Promise<ProjectSnapshot> {
  const allFiles = rankFiles(await collectFiles(root));

  if (allFiles.length === 0) {
    throw new AppError(
      "No readable source files were found to build a README from this workspace.",
      "invalid_project"
    );
  }

  let totalChars = 0;
  let truncated = false;
  const sections: string[] = [];

  for (const relativePath of allFiles) {
    if (sections.length >= MAX_FILES || totalChars >= MAX_TOTAL_CHARS) {
      truncated = true;
      break;
    }

    const snippet = await readSnippet(root, relativePath);
    if (!snippet) {
      continue;
    }

    const remaining = MAX_TOTAL_CHARS - totalChars;
    const boundedSnippet =
      snippet.length > remaining ? `${snippet.slice(0, remaining)}\n...` : snippet;
    totalChars += boundedSnippet.length;
    sections.push(`FILE: ${relativePath}\n${boundedSnippet}`);

    if (boundedSnippet.length < snippet.length) {
      truncated = true;
      break;
    }
  }

  if (sections.length === 0) {
    throw new AppError(
      "Project files were found, but none contained readable text for README generation.",
      "invalid_project"
    );
  }

  return {
    summary: sections.join("\n\n"),
    fileCount: sections.length,
    truncated
  };
}
