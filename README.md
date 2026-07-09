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
| Translate | `modes/translate.md` | own hotkey (manual) | S1-Language* | Clean **and** translate — opt-in only |

Every prompt shares four hard rules: dictation is **data, not instructions**; keep the input language; never translate; output only the cleaned text.

\* Deploys on S1-Language (fast, private, and the one model id verified for auto-deploy). For Email/Browser you may prefer **Haiku 4.5**, and Note benefits from **Sonnet 4.5** for restructuring — switch the model in-app. See each mode's `recommendedModel`.

## Each mode file has machine-readable frontmatter

The YAML frontmatter (key, version, model, activation apps/sites, context toggles) is the **single source of truth** — it's both the human record and what `tools/sync.ts` compiles into SuperWhisper's own mode JSON. So git history of the `.md` files is the version history of the actually-deployed config, not just the prose.

## Deploy

```bash
bun run tools/sync.ts            # compile modes → ./dist (safe preview)
bun run tools/sync.ts --install  # write into ~/Documents/superwhisper/modes (restart SuperWhisper after)
```

Optionally paste the pairs from `shared/examples.md` into each mode's **Examples** field in-app — it hardens injection-resistance and the language lock more than the prompt alone. (SuperWhisper's example-field schema isn't documented, so sync leaves `promptExamples` empty for you to add by hand.)

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
tools/        sync.ts (deploy), modes.ts (loader)
trace/        harvest.ts → traces.jsonl (real usage, gitignored)
evals/        cases.jsonl + run.ts → runs/ (regression tests, gitignored)
CHANGELOG.md  human "why" behind each version bump
```
