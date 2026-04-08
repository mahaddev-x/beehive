import { Agent } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { BeeDefinition } from "./bee.js";
import { interpolatePrompt, getEffectiveRetry } from "./bee.js";
import type { BeConfig } from "./config.js";
import { resolveModel } from "./model.js";
import type { BeeResult } from "./store.js";
import { resolveTools, loadPlugins } from "./tools/index.js";

export interface RunnerOptions {
  /** Stream LLM output to this callback (for interactive test mode) */
  onChunk?: (text: string) => void;
  /** Called on tool execution start */
  onTool?: (name: string, args: Record<string, unknown>) => void;
}

export async function runBee(
  bee: BeeDefinition,
  input: Record<string, string>,
  index: number,
  config: BeConfig,
  options: RunnerOptions = {},
): Promise<BeeResult> {
  const start = Date.now();
  const retry = getEffectiveRetry(bee);
  const modelStr = bee.model ?? config.defaults?.model ?? "groq/llama-3.1-8b-instant";
  const timeoutMs = (bee.timeout_seconds ?? config.defaults?.timeout_seconds ?? 60) * 1000;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retry.max_attempts; attempt++) {
    try {
      const result = await runSingleAttempt(
        bee,
        input,
        index,
        config,
        modelStr,
        timeoutMs,
        options,
      );
      result.duration_ms = Date.now() - start;
      return result;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      if (attempt < retry.max_attempts) {
        const waitSec = parseRetryAfter(lastError) ?? retry.backoff_seconds;
        await sleep(waitSec * 1000);
      }
    }
  }

  return {
    index,
    status: "failed",
    input,
    error: lastError?.message ?? "Unknown error",
    duration_ms: Date.now() - start,
    tokens_input: 0,
    tokens_output: 0,
    cost_usd: 0,
    model_used: modelStr,
    completed_at: new Date().toISOString(),
  };
}

async function runSingleAttempt(
  bee: BeeDefinition,
  input: Record<string, string>,
  index: number,
  config: BeConfig,
  modelStr: string,
  timeoutMs: number,
  options: RunnerOptions,
): Promise<BeeResult> {
  const model = resolveModel(modelStr, config.providers.ollama_url);

  // Resolve tools
  const builtInTools = resolveTools(bee.tools ?? []);
  const pluginTools = await loadPlugins(bee.plugins ?? []);
  const allTools = [...builtInTools, ...pluginTools];

  // Build system prompt with JSON instruction if needed
  const outputFormat = bee.output_format ?? (bee.output_schema ? "json" : "text");
  let systemPrompt = bee.system_prompt;
  if (outputFormat === "json" && bee.output_schema) {
    systemPrompt += `\n\nReturn ONLY valid JSON matching this schema (no markdown fences, no explanation):\n${JSON.stringify(bee.output_schema, null, 2)}`;
  }

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools: allTools,
    },
  });

  // Accumulate usage across turns
  let tokensInput = 0;
  let tokensOutput = 0;
  let costUsd = 0;
  let turns = 0;
  let lastAssistant: AssistantMessage | undefined;

  agent.subscribe(async (event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta" &&
      options.onChunk
    ) {
      options.onChunk((event.assistantMessageEvent as unknown as { delta: string }).delta);
    }

    if (event.type === "turn_end") {
      turns++;
      const msg = event.message;
      if (msg.role === "assistant") {
        lastAssistant = msg as AssistantMessage;
        const u = lastAssistant.usage;
        tokensInput += u.input;
        tokensOutput += u.output;
        costUsd += u.cost.total;
      }
    }

    if (event.type === "agent_end") {
      // Capture last assistant from final messages if turn_end didn't fire
      for (let i = event.messages.length - 1; i >= 0; i--) {
        const m = event.messages[i]!;
        if (m.role === "assistant") {
          if (!lastAssistant) lastAssistant = m as AssistantMessage;
          break;
        }
      }
    }

    if (
      event.type === "tool_execution_start" &&
      options.onTool
    ) {
      options.onTool(
        event.toolName,
        event.args as Record<string, unknown>,
      );
    }
  });

  const userPrompt = interpolatePrompt(bee.user_prompt_template, input);

  // Run with timeout
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      agent.abort();
      reject(new Error(`Bee "${bee.name}" timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  try {
    await Promise.race([agent.prompt(userPrompt), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const rawText =
    lastAssistant?.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("") ?? "";

  let output: string | Record<string, unknown>;
  if (outputFormat === "json") {
    output = extractJson(rawText, bee.output_schema);
  } else {
    output = rawText;
  }

  return {
    index,
    status: "success",
    input,
    output,
    duration_ms: 0, // set by caller
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    cost_usd: costUsd,
    model_used: modelStr,
    completed_at: new Date().toISOString(),
    turns,
  };
}

function extractJson(
  text: string,
  schema?: Record<string, string>,
): Record<string, unknown> {
  // Strip markdown code blocks if present
  let cleaned = text.trim();
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fence) cleaned = fence[1]!.trim();

  // Find first JSON object in text
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.slice(start, end + 1);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Return as-is in a wrapper if we can't parse JSON
    return { _raw: text, _parse_error: "Could not parse JSON response" };
  }

  // Soft validation: check that required properties exist
  const props = (schema as Record<string, unknown>)?.properties;
  if (props && typeof props === "object") {
    for (const key of Object.keys(props)) {
      if (!(key in parsed)) {
        parsed[`_missing_${key}`] = true;
      }
    }
  }

  return parsed;
}

function parseRetryAfter(err: Error): number | null {
  const msg = err.message;
  if (!msg.includes("429")) return null;
  const match = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1]!)) + 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
