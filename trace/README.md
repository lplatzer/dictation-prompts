# Trace: harvest & export

## Harvest (local, free, no external calls)

```bash
bun run trace/harvest.ts
```

Aggregates SuperWhisper's own per-dictation records (`<superwhisper-dir>/recordings/*/meta.json` — macOS `~/Documents/superwhisper`, Windows `%LOCALAPPDATA%\com.superwhisper.app`) into `trace/traces.jsonl` — raw input, cleaned output, model, mode, timestamp, latency. Append-only, deduped, **gitignored** (real content — never commit).

## Export to a tracing/eval tool (OTLP)

`export.ts` emits your traces as OpenTelemetry GenAI spans and sends them to any OTLP-compatible backend, so you can trial all four tools with the same sample data by only changing env vars.

```bash
bun run trace/export.ts            # dry run → trace/otlp-payload.json (inspect first)
```

Then point it at a backend via the **standard OTel env vars**:

| Tool | `OTEL_EXPORTER_OTLP_ENDPOINT` | `OTEL_EXPORTER_OTLP_HEADERS` |
|------|-------------------------------|------------------------------|
| **Langfuse** | `https://cloud.langfuse.com/api/public/otel` | `Authorization=Basic <base64(pk:sk)>` |
| **Arize Phoenix** | `http://localhost:6006` (self-host) or your Phoenix cloud URL | `api_key=<key>` (cloud) |
| **Braintrust** | `https://api.braintrust.dev/otel` | `Authorization=Bearer <key>, x-bt-parent=project_name:<name>` |
| **LangSmith** | `https://api.smith.langchain.com/otel` | `x-api-key=<key>, Langsmith-Project=<name>` |

```bash
OTEL_EXPORTER_OTLP_ENDPOINT="https://cloud.langfuse.com/api/public/otel" \
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <token>" \
  bun run trace/export.ts --limit 50
```

### Attribute coverage

Each span carries a **superset** of conventions so every backend finds what it reads:
- OpenInference (`input.value`, `output.value`, `openinference.span.kind`) — Phoenix/Arize.
- OTel GenAI (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.prompt`, `gen_ai.completion`) — LangSmith, Langfuse, Braintrust.
- `superwhisper.*` (mode, stt_model, app_version, processing_ms).

Endpoints/header formats drift — check each tool's current OTLP docs if ingestion looks off. This is a dependency-free minimal exporter; swap in the official OpenTelemetry SDK if you outgrow it.

> **Privacy:** exporting uploads your real dictation content to an external SaaS. Dry-run and inspect `otlp-payload.json` before sending, and prefer a self-hosted backend (Phoenix or self-hosted Langfuse) if the content is sensitive.
