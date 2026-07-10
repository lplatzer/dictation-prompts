# Changelog

Human-readable "why" behind each prompt change. Git history is the "what" (line-level diffs); the `version` field in each mode's frontmatter is the join key that ties an observed behavior (in a trace or eval run) back to a specific generation.

**Bump a mode's `version` whenever you change anything that can affect its output** — the prompt body, the model, or context toggles. Add a line here saying what changed and why.

## Format

`YYYY-MM-DD — <mode> v<n> — <what changed> — <why>`

## Log

- 2026-07-10 — examples restored inline — per SuperWhisper support, the separate `promptExamples` field is deprecated; examples now belong inline in the prompt as XML. sync renders `shared/examples.json` into an `<examples>` block appended to each prompt (keeping `promptExamples: []`). Restores the reinforcement layer via the supported path.

- 2026-07-10 — tooling fix — root-caused why installed modes wouldn't activate. Two bugs: (1) `--install` only dropped JSON files but never registered keys in `settings.json`'s `modeKeys` (SuperWhisper's real mode registry — modes aren't in the sqlite DB); (2) a populated `promptExamples` array is silently rejected by SuperWhisper 2.16.x, stripping the whole mode. Fix: `sync --install` now also registers `modeKeys` (idempotent, backup, cross-OS), and always emits `promptExamples: []`. Confirmed by an A/B probe against the app-authored `custom.json`.

- 2026-07-09 — coding v1, code-gen v1 — added a coding-cleanup mode (IDEs + terminals, preserves identifiers) and a spoken-description→code mode (the deliberate injection exception) — cover dictating to coding agents and generating code.
- 2026-07-09 — tooling — cross-OS path resolver (macOS/Windows + SUPERWHISPER_DIR), single `cli.ts` compiling to a standalone executable, and an OTLP exporter (`trace/export.ts`) for Langfuse/Phoenix/Braintrust/LangSmith.
- 2026-07-09 — all modes v1 — initial set: clean, message, email, note, browser, translate — first cut of the SuperWhisper cleanup modes.
