import * as vscode from "vscode";
import type { CommitResult, DiffSource } from "./types";

type WebviewActionHandler = {
  onCopy(message: string): Promise<void>;
  onInsert(message: string): Promise<void>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMessageCard(label: string, message: string): string {
  const safeMessage = escapeHtml(message);
  const encoded = JSON.stringify(message);

  return `
    <section class="card">
      <div class="card-header">
        <span class="label">${escapeHtml(label)}</span>
        <div class="actions">
          <button data-action="copy" data-message='${escapeHtml(encoded)}'>Copy</button>
          <button class="primary" data-action="insert" data-message='${escapeHtml(encoded)}'>Insert</button>
        </div>
      </div>
      <code>${safeMessage}</code>
    </section>
  `;
}

export function showResultsPanel(
  context: vscode.ExtensionContext,
  result: CommitResult,
  source: DiffSource,
  handlers: WebviewActionHandler
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    "aiCommitMessageGenerator.results",
    "AI Git Assistant",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.svg");
  panel.webview.html = getWebviewHtml(panel.webview, result, source);

  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (!isActionMessage(message)) {
      return;
    }

    if (message.type === "copy") {
      await handlers.onCopy(message.value);
      return;
    }

    if (message.type === "insert") {
      await handlers.onInsert(message.value);
    }
  });

  return panel;
}

function isActionMessage(
  value: unknown
): value is { type: "copy" | "insert"; value: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "value" in value &&
    (value.type === "copy" || value.type === "insert") &&
    typeof value.value === "string"
  );
}

function getWebviewHtml(
  webview: vscode.Webview,
  result: CommitResult,
  source: DiffSource
): string {
  const nonce = crypto.randomUUID();
  const cards = [
    renderMessageCard("Primary", result.primary),
    ...result.alternatives.map((message, index) =>
      renderMessageCard(`Alternative ${index + 1}`, message)
    )
  ].join("");

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
      />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>AI Git Assistant</title>
      <style>
        :root {
          color-scheme: light dark;
          --bg: #0f172a;
          --bg-soft: #111827;
          --panel: rgba(15, 23, 42, 0.82);
          --border: rgba(148, 163, 184, 0.28);
          --text: #e5eefb;
          --muted: #9fb0c9;
          --accent: #34d399;
          --accent-strong: #10b981;
        }
        body {
          margin: 0;
          padding: 24px;
          font-family: var(--vscode-font-family, sans-serif);
          background:
            radial-gradient(circle at top, rgba(52, 211, 153, 0.18), transparent 28%),
            linear-gradient(180deg, #020617, var(--bg));
          color: var(--text);
        }
        main {
          max-width: 880px;
          margin: 0 auto;
        }
        .hero {
          margin-bottom: 24px;
          padding: 24px;
          border: 1px solid var(--border);
          border-radius: 24px;
          background: rgba(15, 23, 42, 0.7);
          box-shadow: 0 24px 80px rgba(2, 6, 23, 0.42);
        }
        .eyebrow {
          display: inline-flex;
          margin-bottom: 14px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(52, 211, 153, 0.14);
          color: #d1fae5;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }
        h1 {
          margin: 0 0 8px;
          font-size: 28px;
          line-height: 1.15;
        }
        p {
          margin: 0;
          color: var(--muted);
          line-height: 1.6;
        }
        .grid {
          display: grid;
          gap: 14px;
        }
        .card {
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: rgba(15, 23, 42, 0.66);
        }
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .label {
          color: var(--muted);
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .actions {
          display: flex;
          gap: 8px;
        }
        button {
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 8px 12px;
          background: transparent;
          color: var(--text);
          cursor: pointer;
        }
        button.primary {
          border-color: transparent;
          background: linear-gradient(135deg, var(--accent), var(--accent-strong));
          color: #052e2b;
          font-weight: 700;
        }
        code {
          display: block;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: var(--vscode-editor-font-family, monospace);
          font-size: 13px;
          line-height: 1.7;
        }
        .reasoning {
          margin-top: 14px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: rgba(15, 23, 42, 0.5);
        }
        @media (max-width: 720px) {
          body {
            padding: 16px;
          }
          .card-header {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      </style>
    </head>
    <body>
      <main>
        <section class="hero">
          <span class="eyebrow">AI Git Assistant</span>
          <h1>Generated commit messages</h1>
          <p>Source: ${escapeHtml(source)} diff. Copy any suggestion or insert it into the active editor when possible.</p>
        </section>
        <section class="grid">${cards}</section>
        <section class="reasoning">
          <span class="label">Reasoning</span>
          <p>${escapeHtml(result.reasoning)}</p>
        </section>
      </main>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLButtonElement)) {
            return;
          }

          const action = target.dataset.action;
          const message = target.dataset.message;
          if (!action || !message) {
            return;
          }

          vscode.postMessage({
            type: action,
            value: JSON.parse(message)
          });
        });
      </script>
    </body>
  </html>`;
}
