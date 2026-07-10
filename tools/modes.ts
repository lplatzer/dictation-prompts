// Shared loader for mode files. Parses the small, controlled YAML-subset
// frontmatter used in modes/*.md and returns the prompt body (the block below
// the final `---`). Zero deps on purpose — the frontmatter shape is fixed.
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ModeContext {
  application: boolean;
  clipboard: boolean;
  selection: boolean;
}

export interface Mode {
  key: string;
  name: string;
  version: number;
  updated: string;
  deployModel: string;
  recommendedModel: string;
  isDefault: boolean;
  activationApps: string[];
  activationSites: string[];
  context: ModeContext;
  translateToEnglish: boolean;
  prompt: string; // the body below the final `---`
  file: string;
}

const MODES_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), "modes");

function coerce(v: string): string | number | boolean {
  const t = v.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "[]") return "[]"; // handled by caller
  if (/^-?\d+$/.test(t)) return Number(t);
  return t.replace(/^["']|["']$/g, "");
}

// Minimal parser for our exact frontmatter: scalars, `context:` map,
// and `- item` lists under activationApps/activationSites.
function parseFrontmatter(fm: string): Record<string, any> {
  const out: Record<string, any> = {};
  const lines = fm.split("\n");
  let listKey: string | null = null;
  let inContext = false;
  for (const raw of lines) {
    if (raw.trim() === "") continue;
    const indented = /^\s+/.test(raw);
    const listItem = raw.match(/^\s+-\s+(.*)$/);
    if (listItem && listKey) {
      (out[listKey] as string[]).push(coerce(listItem[1]) as string);
      continue;
    }
    if (inContext && indented) {
      const m = raw.match(/^\s+([A-Za-z]+):\s*(.*)$/);
      if (m) out.context[m[1]] = coerce(m[2]);
      continue;
    }
    // top-level key
    const m = raw.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    listKey = null;
    inContext = false;
    if (key === "context") {
      out.context = {};
      inContext = true;
    } else if (key === "activationApps" || key === "activationSites") {
      out[key] = [];
      if (val.trim() === "[]") continue;
      listKey = key;
    } else {
      out[key] = coerce(val);
    }
  }
  return out;
}

export function loadMode(file: string): Mode {
  // Normalize Windows quirks: strip a UTF-8 BOM and convert CRLF/CR → LF, so
  // the frontmatter regex below anchors correctly regardless of git eol settings.
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const block = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!block) throw new Error(`Mode ${file}: missing or malformed frontmatter block`);
  const fm = parseFrontmatter(block[1]);
  if (!fm.key) throw new Error(`Mode ${file}: frontmatter is missing "key"`);
  // The prompt is the last chunk of the doc, after the human header's `---`.
  const bodyParts = block[2].split(/^---\s*$/m);
  const prompt = (bodyParts[bodyParts.length - 1] ?? "").trim();
  return {
    key: fm.key,
    name: fm.name,
    version: fm.version ?? 1,
    updated: fm.updated ?? "",
    deployModel: fm.deployModel ?? "s1-language",
    recommendedModel: fm.recommendedModel ?? fm.deployModel ?? "s1-language",
    isDefault: fm.isDefault ?? false,
    activationApps: fm.activationApps ?? [],
    activationSites: fm.activationSites ?? [],
    context: {
      application: fm.context?.application ?? false,
      clipboard: fm.context?.clipboard ?? false,
      selection: fm.context?.selection ?? false,
    },
    translateToEnglish: fm.translateToEnglish ?? false,
    prompt,
    file,
  };
}

export function loadAllModes(): Mode[] {
  return readdirSync(MODES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => loadMode(join(MODES_DIR, f)));
}

export function loadModeByKey(key: string): Mode {
  const m = loadAllModes().find((x) => x.key === key || basename(x.file) === `${key}.md`);
  if (!m) throw new Error(`No mode with key or file "${key}"`);
  return m;
}
