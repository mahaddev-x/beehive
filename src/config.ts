import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

export interface BeConfig {
  providers: {
    anthropic_api_key?: string;
    openai_api_key?: string;
    groq_api_key?: string;
    openrouter_api_key?: string;
    google_api_key?: string;
    mistral_api_key?: string;
    together_api_key?: string;
    deepseek_api_key?: string;
    xai_api_key?: string;
    cerebras_api_key?: string;
    ollama_url?: string;
  };
  defaults: {
    model?: string;
    parallel?: number;
    timeout_seconds?: number;
    max_retries?: number;
  };
}

const PROVIDER_ENV: Record<string, string> = {
  anthropic_api_key: "ANTHROPIC_API_KEY",
  openai_api_key: "OPENAI_API_KEY",
  groq_api_key: "GROQ_API_KEY",
  openrouter_api_key: "OPENROUTER_API_KEY",
  google_api_key: "GEMINI_API_KEY",
  mistral_api_key: "MISTRAL_API_KEY",
  together_api_key: "TOGETHER_API_KEY",
  deepseek_api_key: "DEEPSEEK_API_KEY",
  xai_api_key: "XAI_API_KEY",
  cerebras_api_key: "CEREBRAS_API_KEY",
};

export function getDotDir(): string {
  return join(homedir(), ".beehive");
}

export function getConfigPath(): string {
  return join(getDotDir(), "config.toml");
}

export function ensureDotDir(): void {
  const dir = getDotDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const beesDir = join(dir, "bees");
  if (!existsSync(beesDir)) mkdirSync(beesDir, { recursive: true });
  const jobsDir = join(dir, "jobs");
  if (!existsSync(jobsDir)) mkdirSync(jobsDir, { recursive: true });
}

export function loadConfig(): BeConfig {
  ensureDotDir();
  const path = getConfigPath();
  if (!existsSync(path)) {
    return { providers: {}, defaults: {} };
  }
  const raw = readFileSync(path, "utf-8");
  const parsed = parseToml(raw) as Record<string, unknown>;
  return {
    providers: (parsed.providers as BeConfig["providers"]) ?? {},
    defaults: (parsed.defaults as BeConfig["defaults"]) ?? {},
  };
}

export function saveConfig(config: BeConfig): void {
  ensureDotDir();
  const toml = stringifyToml(config as unknown as Record<string, unknown>);
  writeFileSync(getConfigPath(), toml, "utf-8");
}

export function applyEnvVars(config: BeConfig): void {
  const p = config.providers;
  for (const [key, envVar] of Object.entries(PROVIDER_ENV)) {
    const val = (p as Record<string, string | undefined>)[key];
    if (val && !process.env[envVar]) {
      process.env[envVar] = val;
    }
  }
  // Ollama URL - not a standard env var, we store it in config
  if (p.ollama_url) {
    process.env.OLLAMA_URL = p.ollama_url;
  }
}

export function getConfigValue(config: BeConfig, key: string): string | undefined {
  const parts = key.split(".");
  let obj: unknown = config;
  for (const part of parts) {
    if (obj == null || typeof obj !== "object") return undefined;
    obj = (obj as Record<string, unknown>)[part];
  }
  return obj != null ? String(obj) : undefined;
}

export function setConfigValue(config: BeConfig, key: string, value: string): void {
  const parts = key.split(".");
  let obj: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in obj) || typeof obj[part] !== "object") {
      obj[part] = {};
    }
    obj = obj[part] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1]!;
  // Try to coerce to number if appropriate
  const num = Number(value);
  obj[lastKey] = !isNaN(num) && value.trim() !== "" ? num : value;
}
