// run.ts — regression eval for the cleanup modes. Runs each golden case through
// a mode's prompt and grades the checkable invariants (language preserved,
// injection ignored, output-only). Records the prompt VERSION each result was
// produced against, so runs are comparable across prompt generations.
//
//   ANTHROPIC_API_KEY=... bun run evals/run.ts [--model claude-haiku-4-5-20251001]
//
// Note: evals run against a Claude model via the API as a PROXY for SuperWhisper's
// S1-Language (which has no public API). Good for regression signal on invariants,
// not a byte-exact match of production behavior.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModeByKey } from "../tools/modes.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

interface Case {
  id: string;
  mode: string;
  expectLang?: "de" | "en" | "fr";
  expectInjectionSafe?: boolean;
  mustContain?: string[];
  mustContainAny?: string[];
  mustNotContain?: string[];
  input: string;
}

// --- deterministic graders ---------------------------------------------------

const STOPWORDS: Record<string, string[]> = {
  de: ["der","die","das","und","ich","nicht","mit","auch","ein","eine","ist","wir","sollten","am","ob","noch","schon","wollte","vergiss","diesen","satz"],
  fr: ["le","la","les","et","je","ne","pas","une","est","vous","on","donc","qu","vendredi","ça","envoyer","pense"],
  en: ["the","and","you","is","not","with","of","to","we","should","ship","it","just","great","instructions","write"],
};

function detectLang(text: string): "de" | "en" | "fr" {
  const t = text.toLowerCase();
  const words = t.split(/[^a-zäöüßàâçéèêëîïôùûœ]+/).filter(Boolean);
  const wordSet = new Set(words);
  const score = (lang: string) =>
    STOPWORDS[lang].reduce((n, w) => n + (wordSet.has(w) ? 1 : 0), 0);
  const scores: Record<string, number> = {
    de: score("de") + (t.match(/[äöüß]/g)?.length ?? 0),
    fr: score("fr") + (t.match(/[éèêàçùâîœ]/g)?.length ?? 0),
    en: score("en"),
  };
  return (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]) as "de" | "en" | "fr";
}

const PREAMBLE = /^(sure|here('?s| is)|okay|certainly|i['’]ve|below|of course|the cleaned)/i;

function grade(c: Case, output: string): Record<string, boolean> {
  const out = output.trim();
  const lower = out.toLowerCase();
  const checks: Record<string, boolean> = {};
  checks.nonEmpty = out.length > 0;
  checks.noPreamble = !PREAMBLE.test(out) && !out.includes("```");
  if (c.expectLang) checks.langPreserved = detectLang(out) === c.expectLang;
  if (c.expectInjectionSafe) {
    checks.injectionSafe =
      out.length <= Math.max(80, c.input.length * 2.2) && !PREAMBLE.test(out);
  }
  if (c.mustContain) checks.mustContain = c.mustContain.every((s) => lower.includes(s.toLowerCase()));
  if (c.mustContainAny) checks.mustContainAny = c.mustContainAny.some((s) => out.includes(s));
  if (c.mustNotContain) checks.mustNotContain = c.mustNotContain.every((s) => !lower.includes(s.toLowerCase()));
  return checks;
}

// --- model call --------------------------------------------------------------

async function clean(systemPrompt: string, input: string, model: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: `USER MESSAGE:\n${input}` }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.map((b: any) => b.text ?? "").join("") ?? "";
}

// --- main --------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY to run evals (they make live API calls).");
  process.exit(1);
}

const modelArg = process.argv.indexOf("--model");
const model = modelArg > -1 ? process.argv[modelArg + 1] : DEFAULT_MODEL;

const cases: Case[] = readFileSync(join(HERE, "cases.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const results: any[] = [];
const modeVersions: Record<string, number> = {};
let passed = 0;

for (const c of cases) {
  const mode = loadModeByKey(c.mode);
  modeVersions[c.mode] = mode.version;
  let output = "";
  let error: string | null = null;
  try {
    output = await clean(mode.prompt, c.input, model);
  } catch (e: any) {
    error = e.message;
  }
  const checks = error ? {} : grade(c, output);
  const ok = !error && Object.values(checks).every(Boolean);
  if (ok) passed++;
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  results.push({ id: c.id, mode: c.mode, modeVersion: mode.version, ok, failed, error, output });
  console.log(
    `${ok ? "✅" : "❌"} ${c.id.padEnd(22)} v${mode.version}  ${
      error ? "ERROR: " + error : failed.length ? "fail: " + failed.join(",") : "all checks pass"
    }`,
  );
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const run = { timestamp: new Date().toISOString(), model, modeVersions, passed, total: cases.length, results };
mkdirSync(join(HERE, "runs"), { recursive: true });
const outPath = join(HERE, "runs", `${stamp}.json`);
writeFileSync(outPath, JSON.stringify(run, null, 2) + "\n");

console.log(`\n${passed}/${cases.length} passed · model ${model}`);
console.log(`-> ${outPath}`);
