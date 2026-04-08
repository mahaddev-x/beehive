import { getModels, getProviders } from "@mariozechner/pi-ai";
import type { Api, Model } from "@mariozechner/pi-ai";

// Fallback config for providers not in pi-ai's registry
const EXTRA_PROVIDERS: Record<string, { api: Api; baseUrl: string }> = {
  ollama: { api: "openai-completions", baseUrl: "http://localhost:11434/v1" },
  together: { api: "openai-completions", baseUrl: "https://api.together.xyz/v1" },
  deepseek: { api: "openai-completions", baseUrl: "https://api.deepseek.com/v1" },
};

export function resolveModel(modelStr: string, ollamaUrl?: string): Model<Api> {
  const slashIdx = modelStr.indexOf("/");
  if (slashIdx === -1) {
    throw new Error(
      `Invalid model format "${modelStr}". Use "provider/model-name" (e.g. groq/llama-3.1-8b-instant)`,
    );
  }

  const provider = modelStr.slice(0, slashIdx).toLowerCase();
  const modelId = modelStr.slice(slashIdx + 1);

  const knownProviders = getProviders();

  if (knownProviders.includes(provider as ReturnType<typeof getProviders>[number])) {
    const models = getModels(provider as ReturnType<typeof getProviders>[number]);

    // Exact match
    const exact = models.find(
      (m) => m.id.toLowerCase() === modelId.toLowerCase(),
    );
    if (exact) return exact as Model<Api>;

    // Partial match (model ID contains the string)
    const partial = models.find(
      (m) => m.id.toLowerCase().includes(modelId.toLowerCase()),
    );
    if (partial) {
      // Return a copy with the exact requested ID
      return {
        ...(partial as Model<Api>),
        id: modelId,
        name: modelId,
      };
    }

    // Provider known but model not in registry - build fallback from first model
    const template = models[0] as Model<Api> | undefined;
    if (template) {
      return {
        ...template,
        id: modelId,
        name: modelId,
      };
    }
  }

  // Extra providers (ollama, together, deepseek)
  const extra = EXTRA_PROVIDERS[provider];
  if (extra) {
    const baseUrl =
      provider === "ollama" && ollamaUrl ? `${ollamaUrl}/v1` : extra.baseUrl;
    return {
      id: modelId,
      name: modelId,
      api: extra.api,
      provider,
      baseUrl,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    };
  }

  throw new Error(
    `Unknown provider "${provider}" in model string "${modelStr}". ` +
    `Supported providers: ${[...knownProviders, ...Object.keys(EXTRA_PROVIDERS)].join(", ")}`,
  );
}
