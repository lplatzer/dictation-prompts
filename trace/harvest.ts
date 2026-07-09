// harvest.ts — aggregate SuperWhisper's own per-dictation records into one
// queryable log. SuperWhisper already writes raw input, final output, prompt,
// model and mode for every dictation; this just normalizes them.
//
//   bun run trace/harvest.ts
//
// Output: trace/traces.jsonl (append-only, deduped by recording id).
// This contains your real dictation content, so it is gitignored — never commit it.
import { existsSync, readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { moduleDir, recordingsDir } from "../tools/paths.ts";

const OUT = join(moduleDir(import.meta.url), "traces.jsonl");

interface Trace {
  id: string;
  datetime: string;
  mode: string;
  sttModel: string;
  llmModel: string;
  rawInput: string; // pre-LLM transcript
  output: string; // post-LLM cleaned result
  promptChars: number;
  processingTimeMs: number;
  appVersion: string;
}

export function main() {
  const RECORDINGS = recordingsDir();
  if (!existsSync(RECORDINGS)) {
    console.error(`No SuperWhisper recordings at ${RECORDINGS}`);
    process.exit(1);
  }

  const seen = new Set<string>();
  if (existsSync(OUT)) {
    for (const line of readFileSync(OUT, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        seen.add(JSON.parse(line).id);
      } catch {}
    }
  }

  const dirs = readdirSync(RECORDINGS).filter((d) => {
    try {
      return statSync(join(RECORDINGS, d)).isDirectory();
    } catch {
      return false;
    }
  });

  let added = 0;
  let skippedEmpty = 0;
  const byMode: Record<string, number> = {};

  for (const id of dirs) {
    if (seen.has(id)) continue;
    const metaPath = join(RECORDINGS, id, "meta.json");
    if (!existsSync(metaPath)) continue;
    let meta: any;
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf8"));
    } catch {
      continue;
    }
    const rawInput = (meta.rawResult ?? "").trim();
    const output = (meta.result ?? "").trim();
    if (!rawInput && !output) {
      skippedEmpty++;
      continue;
    }
    const t: Trace = {
      id,
      datetime: meta.datetime ?? "",
      mode: meta.modeName ?? "",
      sttModel: meta.modelName ?? "",
      llmModel: meta.languageModelName ?? "",
      rawInput,
      output,
      promptChars: (meta.prompt ?? "").length,
      processingTimeMs: Number(meta.processingTime ?? 0),
      appVersion: meta.appVersion ?? "",
    };
    appendFileSync(OUT, JSON.stringify(t) + "\n");
    byMode[t.mode || "(none)"] = (byMode[t.mode || "(none)"] ?? 0) + 1;
    added++;
  }

  console.log(`Scanned ${dirs.length} recordings.`);
  console.log(`Added ${added} new traces (skipped ${skippedEmpty} empty, ${seen.size} already harvested).`);
  if (added) {
    console.log("New traces by mode:");
    for (const [mode, n] of Object.entries(byMode).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${mode.padEnd(16)} ${n}`);
    }
  }
  console.log(`\n-> ${OUT}`);
}

if (import.meta.main) main();
