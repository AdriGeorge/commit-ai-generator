# AI Commit Message Generator

AI Commit Message Generator is a minimal VS Code extension that turns a selected git diff, or the staged diff from the current workspace, into conventional commit message suggestions using either OpenAI or Ollama.

## What The Extension Does

- Uses the active text selection when it looks like a diff
- Falls back to `git diff --staged` from the workspace root
- Supports both OpenAI and Ollama backends
- Generates one primary conventional commit message
- Generates three alternative messages
- Explains why the primary type was chosen
- Shows results in a focused webview panel
- Supports copying any message
- Supports inserting a message into the active editor when possible

## How To Run In Extension Development Host

1. Install dependencies:

```bash
npm install
```

2. Compile the extension:

```bash
npm run compile
```

3. Open this folder in VS Code.

4. Press `F5` to launch an Extension Development Host.

5. In the Extension Development Host, open the Command Palette and run:

```text
AI Commit Message: Generate
```

## Provider Setup

Open VS Code settings and set:

- `aiCommitMessageGenerator.provider`
- `aiCommitMessageGenerator.useSelectionFirst` if you want to prefer staged diff lookup over editor selection

### Ollama

Default provider is `ollama`.

1. Install Ollama
2. Start the local Ollama service
3. Pull a model, for example:

```bash
ollama pull qwen2.5-coder:7b
```

4. In VS Code settings, confirm:

- `aiCommitMessageGenerator.provider = ollama`
- `aiCommitMessageGenerator.ollamaModel = qwen2.5-coder:7b`
- `aiCommitMessageGenerator.ollamaBaseUrl = http://127.0.0.1:11434`

### OpenAI

If you want to use OpenAI instead:

- `aiCommitMessageGenerator.provider = openai`
- `aiCommitMessageGenerator.apiKey = <your key>`
- `aiCommitMessageGenerator.model = gpt-5-mini`

## Example Workflow

1. Stage a set of changes in a git repository.
2. Run `AI Commit Message: Generate`.
3. The primary message is copied to the clipboard automatically.
4. Review the primary suggestion, alternatives, and reasoning in the webview.
5. Click `Insert` to place a message in the active editor when available, or `Copy` to place it on the clipboard.

## Example Output

```json
{
  "primary": "feat(prompt): add structured commit message instructions",
  "alternatives": [
    "refactor: tighten commit message prompt rules",
    "fix: return valid JSON commit suggestions",
    "chore: improve AI commit generation flow"
  ],
  "reasoning": "The diff introduces new user-facing commit generation behavior, so feat best matches the main impact."
}
```

## Project Structure

- `src/extension.ts`: command registration and orchestration
- `src/git.ts`: staged diff lookup via `git diff --staged`
- `src/ai.ts`: OpenAI/Ollama requests, validation, and safe parsing
- `src/prompt.ts`: reusable prompt builder
- `src/webview.ts`: webview rendering and message actions
- `src/types.ts`: shared types and constants

## Local Testing Notes

- Use a real git repository in the Extension Development Host.
- Test with selected diff text first.
- Test again with no selection and staged changes present.
- Test Ollama with the local service running.
- Test missing API key, no workspace, Ollama not running, and no staged changes to verify friendly error handling.
