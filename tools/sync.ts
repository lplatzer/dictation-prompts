// sync.ts — compile modes/*.md into SuperWhisper mode JSON.
//
//   bun run tools/sync.ts            # write to ./dist (safe, default)
//   bun run tools/sync.ts --install  # write into SuperWhisper + register the modes
//
// The .md frontmatter + prompt body is the single source of truth; git history
// of the .md files is therefore the version history of the deployed config.
//
// Installing a mode into SuperWhisper is TWO steps, both required (learned the
// hard way): (1) write <key>.json into the modes dir, and (2) register <key> in
// settings.json's `modeKeys`. A file that isn't registered lists on macOS but
// can't activate, and doesn't appear at all on Windows.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadAllModes, type Mode } from "./modes.ts";
import { modesDir, moduleDir, settingsFile } from "./paths.ts";

// Only models whose SuperWhisper id we've verified. Deploying an unknown id
// would silently misconfigure the mode, so we fail loudly instead.
const MODEL_IDS: Record<string, string> = {
  "s1-language": "sl-1",
};
const VOICE_MODEL_ID = "nvidia_parakeet-v3_494MB";

function toSuperwhisper(m: Mode) {
  const languageModelID = MODEL_IDS[m.deployModel];
  if (!languageModelID) {
    throw new Error(
      `Mode "${m.key}": deployModel "${m.deployModel}" has no verified SuperWhisper id. ` +
        `Deploy on a known model (${Object.keys(MODEL_IDS).join(", ")}) and switch to "${m.deployModel}" in-app.`,
    );
  }
  return {
    activationApps: m.activationApps,
    activationSites: m.activationSites,
    autocapitalizeInsert: true,
    contextFromActiveApplication: m.context.application,
    contextFromClipboard: m.context.clipboard,
    contextFromSelection: m.context.selection,
    contextTemplate: "Use the copied text as context to complete this task.\n\nCopied text: ",
    description: "",
    diarize: false,
    iconName: "",
    key: m.key,
    language: "auto",
    languageModelID,
    literalPunctuation: false,
    name: m.name,
    prompt: m.prompt,
    // MUST stay empty. This SuperWhisper build (2.16.x) silently REJECTS a mode
    // whose promptExamples is populated — the mode vanishes from the UI and gets
    // stripped from modeKeys. The examples UI was removed and the field's real
    // schema is unknown; shared/examples.json is kept as docs only. Verified via
    // a controlled A/B probe (empty → works, populated {input,output} → rejected).
    promptExamples: [],
    realtimeOutput: false,
    script: "",
    scriptEnabled: false,
    translateToEnglish: m.translateToEnglish,
    type: "custom",
    useSystemAudio: false,
    version: m.version,
    voiceModelID: VOICE_MODEL_ID,
  };
}

// Register mode keys in SuperWhisper's settings.json so they actually activate.
// Idempotent: adds only missing keys, preserves order/others, backs up first.
function registerInSettings(modes: Mode[]) {
  const file = settingsFile();
  if (!existsSync(file)) {
    console.log(`  ! settings.json not found at ${file} — skipped registration; modes won't activate until registered.`);
    return;
  }
  const cfg = JSON.parse(readFileSync(file, "utf8")) as { modeKeys?: string[] };
  writeFileSync(`${file}.bak-${Date.now()}`, JSON.stringify(cfg, null, 2) + "\n");
  const keys = Array.isArray(cfg.modeKeys) ? cfg.modeKeys : [];
  const added = modes.map((m) => m.key).filter((k) => !keys.includes(k));
  cfg.modeKeys = [...keys, ...added];
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`  registered ${added.length} new key(s) in modeKeys${added.length ? ": " + added.join(", ") : ""}`);
}

export function main() {
  const install = process.argv.includes("--install");
  const repoRoot = dirname(moduleDir(import.meta.url));
  const outDir = install ? modesDir() : join(repoRoot, "dist");
  mkdirSync(outDir, { recursive: true });

  const modes = loadAllModes();
  for (const m of modes) {
    const json = toSuperwhisper(m);
    const path = join(outDir, `${m.key}.json`);
    writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
    console.log(`  ${m.key.padEnd(18)} v${m.version}  ${m.deployModel.padEnd(12)} -> ${path}`);
  }
  if (install) registerInSettings(modes);
  console.log(
    install
      ? `\nInstalled ${modes.length} modes into SuperWhisper. Fully quit + reopen SuperWhisper to pick them up.`
      : `\nWrote ${modes.length} modes to ./dist. Re-run with --install to deploy them into SuperWhisper.`,
  );
}

if (import.meta.main) main();
