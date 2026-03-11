export const ALLOWED_TYPES = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "test",
  "chore",
  "perf",
  "build",
  "ci"
] as const;

export type CommitResult = {
  primary: string;
  alternatives: [string, string, string];
  reasoning: string;
};

export type DiffSource = "selection" | "staged";

export type DiffInput = {
  diff: string;
  source: DiffSource;
};

export type ExtensionConfig = {
  provider: "openai" | "ollama";
  apiKey: string;
  model: string;
  useSelectionFirst: boolean;
  ollamaModel: string;
  ollamaBaseUrl: string;
};

export class AppError extends Error {
  constructor(
    message: string,
    readonly code:
      | "missing_api_key"
      | "no_workspace"
      | "git_missing"
      | "no_staged_changes"
      | "invalid_diff"
      | "ai_request_failed"
  ) {
    super(message);
    this.name = "AppError";
  }
}
