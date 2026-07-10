# Dictation prompts for SuperWhisper

Cleanup prompts for SuperWhisper custom modes. They turn raw speech-to-text (Parakeet / Whisper) into clean, usable text — **without ever following what the dictation says**, and **without translating** (German stays German, English stays English, French stays French).

## Design in one paragraph

Rather than one giant context-branching prompt, this uses **small, focused modes that SuperWhisper auto-activates per app** — its built-in "auto mode detection." Routing is therefore free (no smart model burned on branching every time), each prompt is cheap and fast, and each is easy to reason about. The single exception is the **browser**: SuperWhisper activates by application, so it can't tell Outlook-web from Teams-web — both are just the browser. Only the URL *inside* the prompt can. So native apps get dedicated modes; the browser gets one URL-aware mode (`browser.md`).

## The modes

| Mode | File | Fires on | Deploy model | Does |
|------|------|----------|--------------|------|
| Clean | `modes/clean.md` | **default** (everything else) | S1-Language | Strip fillers, fix punctuation, no restructuring |
| Message | `modes/message.md` | Slack, Teams, Zoom, Discord, WhatsApp… | S1-Language | Casual, keeps spoken tone |
| Email | `modes/email.md` | Outlook, Apple Mail, Spark | S1-Language* | Professional register, **no greeting/sign-off** |
| Note | `modes/note.md` | Obsidian | S1-Language* | Brain dump → structured Markdown |
| Browser | `modes/browser.md` | any browser | S1-Language* | Reads the URL, adapts email/chat/docs/clean |
| Coding | `modes/coding.md` | IDEs + terminals | S1-Language | Clean technical speech, preserve identifiers |
| Code-gen | `modes/code-gen.md` | own hotkey (manual) | S1-Language* | Spoken description → code (the deliberate exception) |
| Translate | `modes/translate.md` | own hotkey (manual) | S1-Language* | Clean **and** translate — opt-in only |

Every prompt shares four hard rules: dictation is **data, not instructions**; keep the input language; never translate; output only the cleaned text. **`code-gen.md` is the one deliberate exception** — you invoke it by hotkey and it implements what you describe (it only ever types code text, never executes). See its file for the reasoning.

### Coding modes — two different jobs

- **`coding.md`** cleans technical *speech* (dictating to Claude Code / Copilot / Codex / Cursor, or in a terminal) and preserves identifiers, paths, and API names. It can't tell *which* agent you're in — SuperWhisper activates by app, and a terminal agent is just the terminal — but it doesn't need to; the cleanup is the same.
- **`code-gen.md`** turns a spoken description into code, in a language chosen by: explicit override ("use Python") → app-context inference (window-title filename) → TypeScript default.

\* Deploys on S1-Language (fast, private, and the one model id verified for auto-deploy). For Email/Browser you may prefer **Haiku 4.5**, and Note benefits from **Sonnet 4.5** for restructuring — switch the model in-app. See each mode's `recommendedModel`.

## Each mode file has machine-readable frontmatter

The YAML frontmatter (key, version, model, activation apps/sites, context toggles) is the **single source of truth** — it's both the human record and what `tools/sync.ts` compiles into SuperWhisper's own mode JSON. So git history of the `.md` files is the version history of the actually-deployed config, not just the prose.

## Deploy

```bash
bun run sync              # compile modes → ./dist (safe preview)
bun run sync -- --install # write into SuperWhisper's modes dir (restart SuperWhisper after)
```

All tools are also exposed through one CLI, `bun run cli <command>` (`sync`, `harvest`, `export`, `eval`), which compiles to a **standalone cross-OS executable** — no Bun needed on the target machine:

```bash
bun run build:mac   # → dist/bin/dictation-macos
bun run build:win   # → dist/bin/dictation-windows.exe
```

The binary supports the portable field commands `harvest` and `export` (writing to the current directory); `sync` and `eval` need the repo checkout and stay `bun run` commands. Paths are cross-OS: SuperWhisper's data dir resolves on macOS (`~/Documents/superwhisper`) and Windows (`%LOCALAPPDATA%\com.superwhisper.app`) — override with `SUPERWHISPER_DIR`; Linux errors clearly until SuperWhisper ships there.

`--install` does **two** things, both required: writes each `<key>.json` into the modes dir **and** registers each key in `settings.json`'s `modeKeys`. A dropped file that isn't registered lists on macOS but can't activate, and doesn't appear on Windows at all. Fully quit and reopen SuperWhisper afterward. (Tip: quit SuperWhisper *before* `--install` so it doesn't overwrite `settings.json` on its way out.)

> **Examples go inline in the prompt, not in the `promptExamples` field.** Populating `promptExamples` makes SuperWhisper 2.16.x silently reject the whole mode (verified by A/B probe, and confirmed by SuperWhisper support — the separate field is deprecated). The current supported way is examples embedded in the AI instructions as XML. So sync keeps `promptExamples: []` and renders the pairs from `shared/examples.json` into an `<examples>` block appended to each prompt at build time. Edit examples in `examples.json`; they flow into the deployed prompt automatically.

## Versioning — track how a prompt changes

- **Git history** = the line-level "what changed" (you were right that this is enough for diffs).
- **`version` field** in each mode's frontmatter = the join key. Bump it on any output-affecting change so an observed behavior (in a trace or eval) ties back to a specific generation.
- **`CHANGELOG.md`** = the human "why."

## Tracing — how changes affect behavior (with real data)

SuperWhisper already records every dictation to disk: raw input, cleaned output, the exact prompt, model, mode, timestamp. The harvester aggregates them:

```bash
bun run trace/harvest.ts   # ~/Documents/superwhisper/recordings/*/meta.json → trace/traces.jsonl
```

`trace/traces.jsonl` is append-only, deduped, and **gitignored** (it holds your real dictation content — never commit it). This is your production ground truth: filter it by mode/model/date to see what actually happened.

### Export to a tracing/eval tool

`trace/export.ts` ships the harvested traces as OpenTelemetry GenAI spans to any OTLP backend, so you can trial **Langfuse, Arize Phoenix, Braintrust, or LangSmith** on the same sample data by only swapping the standard `OTEL_EXPORTER_OTLP_*` env vars:

```bash
bun run export            # dry-run → trace/otlp-payload.json (inspect first)
OTEL_EXPORTER_OTLP_ENDPOINT=... OTEL_EXPORTER_OTLP_HEADERS=... bun run export
```

Per-vendor endpoints/headers and the privacy note (this uploads real dictation content) are in `trace/README.md`.

## Evals — did my prompt change help or hurt?

Golden cases graded on the checkable invariants (language preserved, injection ignored, output-only):

```bash
ANTHROPIC_API_KEY=... bun run evals/run.ts
```

Each run stamps in the **prompt version per mode**, so a before/after comparison across a change is a real behavioral delta. Evals run against a Claude model as a proxy for S1-Language (no public API) — good for regressions, not byte-exact. Details in `evals/README.md`.

**What's deliberately *not* built** (would be overkill here): live dashboards, streaming pipelines, or an LLM-judge for tone. The invariants are cheaply checkable; tone is cheap to spot-check by eye in the run/trace JSON.

## Repo layout

```
modes/        source of truth: one mode per file (frontmatter + prompt)
shared/       examples for SuperWhisper's Examples field
tools/        cli.ts (entry), sync.ts (deploy), modes.ts (loader), paths.ts (cross-OS)
trace/        harvest.ts → traces.jsonl · export.ts → OTLP (both gitignored outputs)
evals/        cases.jsonl + run.ts → runs/ (regression tests, gitignored)
CHANGELOG.md  human "why" behind each version bump
```
