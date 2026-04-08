import { existsSync, readdirSync, readFileSync } from "fs";
import { join, extname } from "path";
import { parse as parseYaml } from "yaml";
import { getDotDir } from "./config.js";

export interface InputVar {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  description?: string;
}

export interface RetryConfig {
  max_attempts: number;
  backoff_seconds: number;
}

export interface BeeDefinition {
  name: string;
  version?: string;
  description?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  timeout_seconds?: number;
  max_parallel?: number;
  max_turns?: number;
  system_prompt: string;
  user_prompt_template: string;
  input_vars?: InputVar[];
  output_schema?: Record<string, string>;
  output_format?: "json" | "text";
  tools?: string[];
  plugins?: string[];
  retry?: Partial<RetryConfig>;
  /** Source file path (not from YAML) */
  _path?: string;
}

export function loadBeeFromPath(filePath: string): BeeDefinition {
  const raw = readFileSync(filePath, "utf-8");
  const def = parseYaml(raw) as BeeDefinition;
  def._path = filePath;
  return def;
}

export function loadBee(nameOrPath: string): BeeDefinition {
  // Direct file path
  if (existsSync(nameOrPath)) {
    return loadBeeFromPath(nameOrPath);
  }

  // Search in ./bees/ (project-local) and ~/.beehive/bees/ (global)
  const searchDirs = [
    join(process.cwd(), "bees"),
    join(getDotDir(), "bees"),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    // Try exact name match with .yaml and .yml extensions
    for (const ext of [".yaml", ".yml"]) {
      const candidate = join(dir, nameOrPath + ext);
      if (existsSync(candidate)) {
        return loadBeeFromPath(candidate);
      }
    }
    // Try without extension if already has one
    const direct = join(dir, nameOrPath);
    if (existsSync(direct)) {
      return loadBeeFromPath(direct);
    }
  }

  throw new Error(`Bee not found: "${nameOrPath}". Searched in ./bees/ and ~/.beehive/bees/`);
}

export function listBees(): BeeDefinition[] {
  const seen = new Set<string>();
  const bees: BeeDefinition[] = [];

  const searchDirs = [
    join(process.cwd(), "bees"),
    join(getDotDir(), "bees"),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (extname(file) !== ".yaml" && extname(file) !== ".yml") continue;
      const filePath = join(dir, file);
      try {
        const bee = loadBeeFromPath(filePath);
        if (!seen.has(bee.name)) {
          seen.add(bee.name);
          bees.push(bee);
        }
      } catch {
        // Skip invalid files
      }
    }
  }

  return bees.sort((a, b) => a.name.localeCompare(b.name));
}

export function interpolatePrompt(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] ?? `{{${key}}}`;
  });
}

export function getEffectiveRetry(bee: BeeDefinition): RetryConfig {
  return {
    max_attempts: bee.retry?.max_attempts ?? 3,
    backoff_seconds: bee.retry?.backoff_seconds ?? 2,
  };
}
