import OpenAI from "openai";
import { buildPrompt } from "./prompt";
import { ALLOWED_TYPES, AppError, type CommitResult, type ExtensionConfig } from "./types";

const MIN_DIFF_LENGTH = 20;
const MAX_DIFF_LENGTH = 16000;
const commitPattern = new RegExp(
  `^(${ALLOWED_TYPES.join("|")})(\\([a-z0-9-]+\\))?: [^\\n.]{1,72}$`
);
const commitLinePattern = new RegExp(
  `(${ALLOWED_TYPES.join("|")})(\\([^)]+\\))?:\\s+[^\\n.]{1,72}`,
  "gi"
);

export function sanitizeDiff(diff: string): string {
  const trimmed = diff.trim();

  if (!trimmed) {
    throw new AppError("Select a git diff or stage some changes before generating.", "invalid_diff");
  }

  if (trimmed.length < MIN_DIFF_LENGTH) {
    throw new AppError(
      `The diff is too short. Provide at least ${MIN_DIFF_LENGTH} characters.`,
      "invalid_diff"
    );
  }

  return trimmed.length > MAX_DIFF_LENGTH ? trimmed.slice(0, MAX_DIFF_LENGTH) : trimmed;
}

function normalizeJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1).trim();
  }

  return raw.trim();
}

function isValidMessage(value: unknown): value is string {
  return typeof value === "string" && commitPattern.test(value.trim());
}

function normalizeMessage(raw: string): string | null {
  const trimmed = raw.trim().replace(/^[-*]\s*/, "");
  const match = trimmed.match(
    new RegExp(`^(${ALLOWED_TYPES.join("|")})(\\([^)]+\\))?:\\s+(.+)$`, "i")
  );

  if (!match) {
    return null;
  }

  const type = match[1].toLowerCase();
  const scope = (match[2] ?? "").toLowerCase().replace(/\s+/g, "-");
  const subject = match[3].trim().replace(/\.$/, "").replace(/\s+/g, " ");
  const normalized = `${type}${scope}: ${subject}`.slice(0, 72);

  return commitPattern.test(normalized) ? normalized : null;
}

function inferScope(diff: string): string | null {
  const match = diff.match(/diff --git a\/([^\s]+)/);
  const file = match?.[1]?.toLowerCase() ?? "";

  if (file.includes("button") || file.includes("component") || file.includes("page")) {
    return "ui";
  }

  if (file.includes("hook")) {
    return "hooks";
  }

  if (file.includes("readme") || file.includes("docs")) {
    return "docs";
  }

  if (file.includes("test") || file.includes("spec")) {
    return "test";
  }

  if (file.includes("api") || file.includes("route")) {
    return "api";
  }

  return null;
}

function extractAddedTokens(diff: string): string[] {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .flatMap((line) => {
      const textMatches = [...line.matchAll(/["'`]([^"'`]{2,40})["'`]/g)].map((match) =>
        match[1].trim()
      );
      const jsxMatches = [...line.matchAll(/<([A-Z][A-Za-z0-9]+|button)\b/g)].map((match) =>
        match[1].toLowerCase()
      );

      return [...textMatches, ...jsxMatches];
    })
    .filter((token) => {
      const normalized = token.trim();
      if (!normalized) {
        return false;
      }

      if (normalized.toLowerCase() === "button") {
        return true;
      }

      if (normalized.includes(" ")) {
        return true;
      }

      return /^[a-z][a-z0-9_-]*$/i.test(normalized);
    })
    .filter((token) => token.length <= 24);
}

function buildFallbackMessages(diff: string): CommitResult {
  const lower = diff.toLowerCase();
  const scope = inferScope(diff);
  const tokens = extractAddedTokens(diff);
  const quotedLabel = tokens.find((token) => {
    const normalized = token.toLowerCase();
    return (
      /[a-z]/i.test(token) &&
      normalized !== "button" &&
      normalized !== "div" &&
      normalized !== "span" &&
      normalized !== "label" &&
      normalized !== "onclick"
    );
  });
  const uiElement = tokens.find((token) => token === "button" || token.endsWith("button"));

  let type: (typeof ALLOWED_TYPES)[number] = "chore";
  let subject = "update staged changes";

  if (lower.includes("readme") || lower.includes("docs")) {
    type = "docs";
    subject = "document updated workflow";
  } else if (lower.includes("test") || lower.includes("spec")) {
    type = "test";
    subject = "add coverage for updated behavior";
  } else if (lower.includes("fix") || lower.includes("bug") || lower.includes("error")) {
    type = "fix";
    subject = quotedLabel
      ? `fix ${quotedLabel.toLowerCase()} behavior`
      : "fix updated behavior";
  } else if (
    lower.includes("<button") ||
    lower.includes("button") ||
    lower.includes("onclick") ||
    lower.includes("onpress")
  ) {
    type = "feat";
    if (quotedLabel) {
      subject = `add ${quotedLabel.toLowerCase()} button`;
    } else if (uiElement) {
      subject = "add new button";
    } else {
      subject = "add new UI action";
    }
  } else if (lower.includes("add") || lower.includes("new")) {
    type = "feat";
    subject = quotedLabel ? `add ${quotedLabel.toLowerCase()}` : "add new functionality";
  } else if (lower.includes("refactor")) {
    type = "refactor";
    subject = "simplify implementation";
  }

  const primary = `${type}${scope ? `(${scope})` : ""}: ${subject}`.slice(0, 72);
  const normalizedPrimary = normalizeMessage(primary) ?? "chore: update staged changes";

  const alternatives = [
    normalizeMessage(`feat${scope ? `(${scope})` : ""}: ${subject}`),
    normalizeMessage(`refactor${scope ? `(${scope})` : ""}: simplify ${subject}`),
    normalizeMessage(`chore${scope ? `(${scope})` : ""}: update ${subject}`)
  ].filter((value): value is string => Boolean(value));

  while (alternatives.length < 3) {
    alternatives.push("chore: update staged changes");
  }

  return {
    primary: normalizedPrimary,
    alternatives: [alternatives[0], alternatives[1], alternatives[2]],
    reasoning:
      "A heuristic fallback was generated from the diff because the model output was incomplete or malformed."
  };
}

function salvageMessages(raw: string): string[] {
  const matches = raw.match(commitLinePattern) ?? [];
  return matches
    .map((match) => normalizeMessage(match))
    .filter((value): value is string => Boolean(value));
}

export function parseCommitResult(raw: string, diff: string): CommitResult {
  try {
    const parsed = JSON.parse(normalizeJson(raw)) as Partial<CommitResult>;

    const primary = typeof parsed.primary === "string" ? normalizeMessage(parsed.primary) : null;
    const alternatives = Array.isArray(parsed.alternatives)
      ? parsed.alternatives
          .map((value) => (typeof value === "string" ? normalizeMessage(value) : null))
          .filter((value): value is string => Boolean(value))
      : [];

    if (
      primary &&
      alternatives.length >= 1 &&
      typeof parsed.reasoning === "string" &&
      parsed.reasoning.trim().length > 0
    ) {
      const dedupedAlternatives = alternatives.filter((value) => value !== primary);
      while (dedupedAlternatives.length < 3) {
        dedupedAlternatives.push(primary);
      }

      return {
        primary,
        alternatives: [
          dedupedAlternatives[0],
          dedupedAlternatives[1],
          dedupedAlternatives[2]
        ],
        reasoning: parsed.reasoning.trim()
      };
    }
  } catch {
    // Fall back to a safe result below.
  }

  const salvaged = salvageMessages(raw);
  if (salvaged.length > 0) {
    const primary = salvaged[0];
    const alternatives = salvaged.filter((value) => value !== primary);

    while (alternatives.length < 3) {
      alternatives.push(buildFallbackMessages(diff).primary);
    }

    return {
      primary,
      alternatives: [alternatives[0], alternatives[1], alternatives[2]],
      reasoning:
        "The result was recovered from a partially valid model response and completed with safe fallbacks."
    };
  }

  return buildFallbackMessages(diff);
}

export async function generateCommitMessages(
  diff: string,
  config: ExtensionConfig
): Promise<CommitResult> {
  const sanitizedDiff = sanitizeDiff(diff);

  if (config.provider === "openai") {
    return generateWithOpenAI(sanitizedDiff, config);
  }

  return generateWithOllama(sanitizedDiff, config);
}

async function generateWithOpenAI(
  diff: string,
  config: ExtensionConfig
): Promise<CommitResult> {
  if (!config.apiKey.trim()) {
    throw new AppError(
      "Set aiCommitMessageGenerator.apiKey in VS Code settings before generating messages.",
      "missing_api_key"
    );
  }

  const client = new OpenAI({ apiKey: config.apiKey });

  try {
    const response = await client.responses.create({
      model: config.model || "gpt-5-mini",
      input: buildPrompt(diff)
    });

    return parseCommitResult(response.output_text, diff);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The OpenAI request failed.";
    throw new AppError(`AI request failed: ${message}`, "ai_request_failed");
  }
}

type OllamaGenerateResponse = {
  response?: string;
};

async function generateWithOllama(
  diff: string,
  config: ExtensionConfig
): Promise<CommitResult> {
  const baseUrl = config.ollamaBaseUrl.replace(/\/+$/, "");
  const model = config.ollamaModel || "qwen2.5-coder:7b";

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        system:
          "You generate only valid JSON for conventional commit suggestions. Be concrete and specific to the diff.",
        prompt: buildPrompt(diff),
        stream: false,
        format: {
          type: "object",
          properties: {
            primary: { type: "string" },
            alternatives: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 3
            },
            reasoning: { type: "string" }
          },
          required: ["primary", "alternatives", "reasoning"]
        },
        options: {
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama returned ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    if (!payload.response) {
      throw new Error("Ollama returned an empty response body.");
    }

    return parseCommitResult(payload.response, diff);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Ollama request failed.";

    if (
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed") ||
      message.includes("ENOTFOUND")
    ) {
      throw new AppError(
        "Could not reach Ollama. Start Ollama and verify aiCommitMessageGenerator.ollamaBaseUrl.",
        "ai_request_failed"
      );
    }

    throw new AppError(`AI request failed: ${message}`, "ai_request_failed");
  }
}
