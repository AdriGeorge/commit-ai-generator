import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { getWorkspaceRoot } from "./project";
import { AppError, type DiffInput } from "./types";

const execFileAsync = promisify(execFile);

export function getSelectedDiff(): DiffInput | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    return null;
  }

  const diff = editor.document.getText(selection).trim();
  if (!diff) {
    return null;
  }

  return { diff, source: "selection" };
}

export async function getStagedDiff(): Promise<DiffInput> {
  const cwd = getWorkspaceRoot();

  try {
    const { stdout } = await execFileAsync("git", ["diff", "--staged"], {
      cwd,
      maxBuffer: 1024 * 1024 * 4
    });

    const diff = stdout.trim();
    if (!diff) {
      throw new AppError("No staged changes were found in the current workspace.", "no_staged_changes");
    }

    return { diff, source: "staged" };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const execError = error as NodeJS.ErrnoException & { code?: string | number };

    if (execError.code === "ENOENT") {
      throw new AppError("Git is not installed or not available on PATH.", "git_missing");
    }

    throw new AppError(
      "Failed to read the staged diff. Make sure the workspace is a git repository.",
      "no_staged_changes"
    );
  }
}

export async function resolveDiff(useSelectionFirst: boolean): Promise<DiffInput> {
  const selected = getSelectedDiff();

  if (useSelectionFirst && selected) {
    return selected;
  }

  try {
    return await getStagedDiff();
  } catch (error) {
    if (!useSelectionFirst && selected) {
      return selected;
    }

    throw error;
  }
}
