import { ALLOWED_TYPES } from "./types";

export function buildPrompt(diff: string): string {
  return [
    "You are an expert software engineer that writes precise conventional commit messages.",
    "",
    "Task:",
    "Read the provided git diff and generate commit messages.",
    "",
    "Rules:",
    "- Return valid JSON only.",
    "- Do not use markdown fences.",
    "- Do not include commentary outside JSON.",
    `- Allowed types only: ${ALLOWED_TYPES.join(", ")}`,
    "- Prefer a scope only when it is clearly inferable from the diff.",
    "- Subject must be concise, specific, under 72 characters, and in imperative mood.",
    "- Do not end the subject with a period.",
    "- Focus on the most important change in the diff.",
    "- Avoid vague subjects like \"update code\" or \"fix stuff\".",
    "- Prefer concrete nouns from the diff like button, modal, validation, api, hook, readme, test, form, table, or route.",
    "- If the diff adds a new UI element, say what was added.",
    "- If the diff changes visible text, mention the text or label change when possible.",
    "- Keep the subject specific to the diff, not generic to the project.",
    "",
    "Return exactly this shape:",
    "{",
    '  "primary": "type(scope): subject",',
    '  "alternatives": [',
    '    "type: subject",',
    '    "type: subject",',
    '    "type: subject"',
    "  ],",
    '  "reasoning": "One short sentence explaining the chosen type and subject."',
    "}",
    "",
    "Good examples:",
    '{"primary":"feat(ui): add hello button","alternatives":["feat: add hello button","refactor(ui): simplify hello button rendering","chore: update hello button label"],"reasoning":"The main user-facing change adds a new interface control, so feat best matches the diff."}',
    '{"primary":"fix(auth): handle empty token state","alternatives":["fix: handle empty token state","refactor(auth): simplify token guard","test(auth): cover empty token handling"],"reasoning":"The diff corrects broken runtime behavior, so fix is the most accurate type."}',
    "",
    "Git diff:",
    diff
  ].join("\n");
}

export function buildReadmePrompt(projectSummary: string, existingReadme: string | null): string {
  const mode = existingReadme ? "update the existing README" : "create a new README";
  const existingSection = existingReadme
    ? [
        "",
        "Current README:",
        existingReadme.length > 4000 ? `${existingReadme.slice(0, 4000)}\n...` : existingReadme
      ].join("\n")
    : "";

  return [
    "You are an expert software engineer writing a concise, accurate project README.",
    "",
    `Task: ${mode} based on the repository files below.`,
    "",
    "Rules:",
    "- Return markdown only.",
    "- Do not wrap the answer in code fences.",
    "- Base every section on the provided project files.",
    "- Do not invent features, scripts, commands, or architecture that are not present.",
    "- Keep the tone practical and direct.",
    "- Start with a title and a one-paragraph description.",
    "- Include sections for Features, Setup or Usage, Commands, and Project Structure when supported by the codebase.",
    "- Mention both OpenAI and Ollama only if the code actually supports them.",
    "- If a README already exists, preserve useful details but fix omissions and outdated structure.",
    "- Keep the README compact; avoid marketing language.",
    "",
    "Repository snapshot:",
    projectSummary,
    existingSection
  ].join("\n");
}
