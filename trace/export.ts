// export.ts — ship harvested dictation traces to any OTLP-compatible tracing/eval
// tool (Langfuse, Arize Phoenix, Braintrust, LangSmith) as GenAI spans.
//
//   bun run trace/export.ts                 # dry run: writes trace/otlp-payload.json
//   OTEL_EXPORTER_OTLP_ENDPOINT=... \
//   OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer xxx" \
//     bun run trace/export.ts               # POST to the backend
//   bun run trace/export.ts --limit 50
//
// Uses the standard OTEL_EXPORTER_OTLP_* env vars, so one script targets any
// backend — that's the "evaluate all four tools" setup. See trace/README.md.
//
// WARNING: this sends your real dictation content to an external service.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { moduleDir } from "../tools/paths.ts";

const HERE = moduleDir(import.meta.url);
const TRACES = join(HERE, "traces.jsonl");

interface Trace {
  id: string;
  datetime: string;
  mode: string;
  sttModel: string;
  llmModel: string;
  rawInput: string;
  output: string;
  processingTimeMs: number;
  appVersion: string;
}

const strAttr = (key: string, value: string) => ({ key, value: { stringValue: value } });
const intAttr = (key: string, value: number) => ({ key, value: { intValue: String(Math.trunc(value)) } });

function providerOf(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("gpt")) return "openai";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gemini")) return "google";
  if (m.includes("grok")) return "xai";
  if (m.includes("llama")) return "meta";
  if (m.includes("s1")) return "superwhisper";
  return "unknown";
}

function spanFor(t: Trace) {
  const startMs = Number.isNaN(Date.parse(t.datetime)) ? Date.now() : Date.parse(t.datetime);
  const startNano = BigInt(startMs) * 1_000_000n;
  const endNano = startNano + BigInt(Math.max(0, t.processingTimeMs)) * 1_000_000n;
  return {
    traceId: randomBytes(16).toString("hex"),
    spanId: randomBytes(8).toString("hex"),
    name: `dictation ${t.mode || "(none)"}`,
    kind: 3, // CLIENT — an LLM call
    startTimeUnixNano: startNano.toString(),
    endTimeUnixNano: endNano.toString(),
    attributes: [
      // OpenInference (Arize Phoenix)
      strAttr("openinference.span.kind", "LLM"),
      strAttr("input.value", t.rawInput),
      strAttr("output.value", t.output),
      strAttr("llm.model_name", t.llmModel),
      // OpenTelemetry GenAI semconv (LangSmith / Langfuse / Braintrust / OpenLLMetry)
      strAttr("gen_ai.system", providerOf(t.llmModel)),
      strAttr("gen_ai.request.model", t.llmModel),
      strAttr("gen_ai.operation.name", "chat"),
      strAttr("gen_ai.prompt", t.rawInput),
      strAttr("gen_ai.completion", t.output),
      // SuperWhisper-specific
      strAttr("superwhisper.mode", t.mode),
      strAttr("superwhisper.stt_model", t.sttModel),
      strAttr("superwhisper.app_version", t.appVersion),
      intAttr("superwhisper.processing_ms", t.processingTimeMs),
    ],
  };
}

export async function main() {
  if (!existsSync(TRACES)) {
    console.error(`No traces at ${TRACES}. Run: bun run trace/harvest.ts`);
    process.exit(1);
  }
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const traces: Trace[] = readFileSync(TRACES, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .slice(0, limit);

  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [strAttr("service.name", "superwhisper-dictation")],
        },
        scopeSpans: [
          {
            scope: { name: "dictation-prompts", version: "0.1.0" },
            spans: traces.map(spanFor),
          },
        ],
      },
    ],
  };

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const dryRun = process.argv.includes("--dry-run") || !endpoint;

  if (dryRun) {
    const out = join(HERE, "otlp-payload.json");
    writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
    console.log(`Dry run — built ${traces.length} spans.`);
    console.log(`-> ${out}`);
    console.log(
      `\nTo send: set OTEL_EXPORTER_OTLP_ENDPOINT (+ OTEL_EXPORTER_OTLP_HEADERS) and re-run.\n` +
        `This will upload your real dictation content externally. See trace/README.md.`,
    );
    return;
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  for (const pair of (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "").split(",")) {
    const eq = pair.indexOf("=");
    if (eq > 0) headers[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  const url = endpoint!.replace(/\/$/, "") + "/v1/traces";
  console.warn(`Uploading ${traces.length} dictation spans (real content) to ${url} …`);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    console.error(`OTLP export failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Exported ${traces.length} spans -> ${url} (${res.status}).`);
}

if (import.meta.main) main();
