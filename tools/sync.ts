// sync.ts — compile modes/*.md into SuperWhisper mode JSON.
//
//   bun run tools/sync.ts            # write to ./dist (safe, default)
//   bun run tools/sync.ts --install  # write to ~/Documents/superwhisper/modes (live)
//
// The .md frontmatter + prompt body is the single source of truth; git history
// of the .md files is therefore the version history of the deployed config.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadAllModes, type Mode } from "./modes.ts";
import { modesDir, moduleDir } from "./paths.ts";

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
  console.log(
    install
      ? `\nInstalled ${modes.length} modes into SuperWhisper. Restart SuperWhisper to pick them up.`
      : `\nWrote ${modes.length} modes to ./dist. Re-run with --install to deploy them into SuperWhisper.`,
  );
}

if (import.meta.main) main();
