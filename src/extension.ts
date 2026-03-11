import * as vscode from "vscode";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateCommitMessages, generateReadmeContent } from "./ai";
import { resolveDiff } from "./git";
import { createProjectSnapshot, getWorkspaceRoot } from "./project";
import { AppError, type ExtensionConfig } from "./types";
import { showResultsPanel } from "./webview";

const outputChannel = vscode.window.createOutputChannel("AI Git Assistant");

function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("aiCommitMessageGenerator");

  return {
    provider: config.get<"openai" | "ollama">("provider", "ollama"),
    apiKey: config.get<string>("apiKey", "").trim(),
    model: config.get<string>("model", "gpt-5-mini").trim(),
    useSelectionFirst: config.get<boolean>("useSelectionFirst", true),
    ollamaModel: config.get<string>("ollamaModel", "qwen2.5-coder:7b").trim(),
    ollamaBaseUrl: config.get<string>("ollamaBaseUrl", "http://127.0.0.1:11434").trim()
  };
}

async function insertIntoActiveEditor(message: string): Promise<boolean> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.isClosed) {
    return false;
  }

  await editor.edit((editBuilder) => {
    const selection = editor.selection;
    if (!selection.isEmpty) {
      editBuilder.replace(selection, message);
      return;
    }

    editBuilder.insert(selection.active, message);
  });

  return true;
}

async function handleInsert(message: string): Promise<void> {
  const inserted = await insertIntoActiveEditor(message);
  if (inserted) {
    void vscode.window.showInformationMessage("Commit message inserted into the active editor.");
    return;
  }

  await vscode.env.clipboard.writeText(message);
  void vscode.window.showInformationMessage(
    "Commit message copied to clipboard. Paste it into your target input."
  );
}

function log(message: string): void {
  outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

async function runGenerateCommand(context: vscode.ExtensionContext): Promise<void> {
  try {
    log("Starting commit message generation");
    const config = getConfig();
    log(`Configured provider: ${config.provider}`);
    const diffInput = await resolveDiff(config.useSelectionFirst);
    log(`Resolved diff source: ${diffInput.source}`);
    const result = await generateCommitMessages(diffInput.diff, config);
    log(`Generated primary message: ${result.primary}`);

    await vscode.env.clipboard.writeText(result.primary);
    log("Copied primary message to clipboard");

    const action = await vscode.window.showInformationMessage(
      `Primary commit message copied: ${result.primary}`,
      "Open Results"
    );

    if (action === "Open Results") {
      showResultsPanel(context, result, diffInput.source, {
        onCopy: async (message) => {
          await vscode.env.clipboard.writeText(message);
          log(`Copied message to clipboard: ${message}`);
          void vscode.window.showInformationMessage("Commit message copied to clipboard.");
        },
        onInsert: async (message) => {
          log(`Insert requested for message: ${message}`);
          await handleInsert(message);
        }
      });
      return;
    }

    showResultsPanel(context, result, diffInput.source, {
      onCopy: async (message) => {
        await vscode.env.clipboard.writeText(message);
        log(`Copied message to clipboard: ${message}`);
        void vscode.window.showInformationMessage("Commit message copied to clipboard.");
      },
      onInsert: async (message) => {
        log(`Insert requested for message: ${message}`);
        await handleInsert(message);
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      log(`Handled error: ${error.code} - ${error.message}`);
      void vscode.window.showErrorMessage(error.message);
      return;
    }

    const message = error instanceof Error ? error.message : "Unexpected extension failure.";
    log(`Unhandled error: ${message}`);
    void vscode.window.showErrorMessage(message);
  }
}

async function runGenerateReadmeCommand(): Promise<void> {
  try {
    log("Starting README generation");
    const config = getConfig();
    const root = getWorkspaceRoot();
    const readmePath = join(root, "README.md");
    let existingReadme: string | null = null;

    try {
      existingReadme = await readFile(readmePath, "utf8");
      log("Loaded existing README.md");
    } catch {
      log("README.md does not exist yet, creating a new file");
    }

    const snapshot = await createProjectSnapshot(root);
    log(`Collected ${snapshot.fileCount} project files for README generation`);
    if (snapshot.truncated) {
      log("Project snapshot was truncated to stay within prompt limits");
    }

    const nextReadme = await generateReadmeContent(snapshot.summary, existingReadme, config);

    try {
      await writeFile(readmePath, nextReadme, "utf8");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to write README.md to the workspace.";
      throw new AppError(`Failed to write README.md: ${message}`, "readme_write_failed");
    }

    log("README.md written successfully");

    const document = await vscode.workspace.openTextDocument(readmePath);
    await vscode.window.showTextDocument(document, { preview: false });
    void vscode.window.showInformationMessage("README.md created or updated from the current codebase.");
  } catch (error) {
    if (error instanceof AppError) {
      log(`Handled error: ${error.code} - ${error.message}`);
      void vscode.window.showErrorMessage(error.message);
      return;
    }

    const message = error instanceof Error ? error.message : "Unexpected extension failure.";
    log(`Unhandled README error: ${message}`);
    void vscode.window.showErrorMessage(message);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(outputChannel);
  log("Extension activated");

  const generateCommitDisposable = vscode.commands.registerCommand(
    "aiCommitMessageGenerator.generateCommitMessage",
    async () => {
      await runGenerateCommand(context);
    }
  );

  const generateReadmeDisposable = vscode.commands.registerCommand(
    "aiCommitMessageGenerator.generateReadme",
    async () => {
      await runGenerateReadmeCommand();
    }
  );

  context.subscriptions.push(generateCommitDisposable, generateReadmeDisposable);
}

export function deactivate(): void {}
