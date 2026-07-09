# Changelog

Human-readable "why" behind each prompt change. Git history is the "what" (line-level diffs); the `version` field in each mode's frontmatter is the join key that ties an observed behavior (in a trace or eval run) back to a specific generation.

**Bump a mode's `version` whenever you change anything that can affect its output** — the prompt body, the model, or context toggles. Add a line here saying what changed and why.

## Format

`YYYY-MM-DD — <mode> v<n> — <what changed> — <why>`

## Log

- 2026-07-09 — all modes v1 — initial set: clean, message, email, note, browser, translate — first cut of the SuperWhisper cleanup modes.
