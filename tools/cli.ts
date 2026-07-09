// cli.ts — one entry point for all tools, so it can compile to a single
// cross-OS executable (see package.json build:mac / build:win).
//
//   bun run tools/cli.ts <command> [flags]
//   dictation <command> [flags]           # compiled binary
//
// Commands:
//   sync [--install]      compile modes → ./dist (or into SuperWhisper)
//   harvest               pull SuperWhisper recordings → trace/traces.jsonl
//   export [--limit N]    ship traces to an OTLP backend (or dry-run)
//   eval [--model M]      run regression evals (needs ANTHROPIC_API_KEY)

import { isCompiled } from "./paths.ts";

const commands: Record<string, () => Promise<{ main: () => unknown }>> = {
  sync: () => import("./sync.ts"),
  harvest: () => import("../trace/harvest.ts"),
  export: () => import("../trace/export.ts"),
  eval: () => import("../evals/run.ts"),
};

// sync and eval read repo source files (modes/*.md, cases.jsonl) that aren't
// bundled into a standalone binary — they're dev commands, run via `bun run`.
const REPO_ONLY = new Set(["sync", "eval"]);

const cmd = process.argv[2];

if (cmd && isCompiled() && REPO_ONLY.has(cmd)) {
  console.error(`"${cmd}" needs the repo checkout — run it there with: bun run ${cmd}`);
  console.error(`The compiled binary supports: harvest, export.`);
  process.exit(1);
}

if (!cmd || !(cmd in commands)) {
  console.log("Usage: dictation <command> [flags]\n");
  console.log("Commands:");
  console.log("  sync [--install]     compile modes → ./dist (or into SuperWhisper)");
  console.log("  harvest              pull SuperWhisper recordings → trace/traces.jsonl");
  console.log("  export [--limit N]   ship traces to an OTLP backend (or dry-run)");
  console.log("  eval [--model M]     run regression evals (needs ANTHROPIC_API_KEY)");
  process.exit(cmd ? 1 : 0);
}

const mod = await commands[cmd]();
await mod.main();
