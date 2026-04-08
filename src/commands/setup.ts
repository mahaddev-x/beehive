import type { Command } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig, applyEnvVars } from "../config.js";
import { printBanner } from "../ui.js";

const PROVIDERS = [
  {
    key: "groq_api_key",
    name: "Groq",
    envVar: "GROQ_API_KEY",
    hint: "Free tier — fast. Get key at console.groq.com",
  },
  {
    key: "anthropic_api_key",
    name: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    hint: "Claude models. Get key at console.anthropic.com",
  },
  {
    key: "openai_api_key",
    name: "OpenAI",
    envVar: "OPENAI_API_KEY",
    hint: "GPT models. Get key at platform.openai.com",
  },
  {
    key: "openrouter_api_key",
    name: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    hint: "Access any model. Get key at openrouter.ai",
  },
  {
    key: "google_api_key",
    name: "Google",
    envVar: "GEMINI_API_KEY",
    hint: "Gemini models. Get key at aistudio.google.com",
  },
  {
    key: "mistral_api_key",
    name: "Mistral",
    envVar: "MISTRAL_API_KEY",
    hint: "Mistral models. Get key at console.mistral.ai",
  },
  {
    key: "xai_api_key",
    name: "xAI",
    envVar: "XAI_API_KEY",
    hint: "Grok models. Get key at console.x.ai",
  },
  {
    key: "cerebras_api_key",
    name: "Cerebras",
    envVar: "CEREBRAS_API_KEY",
    hint: "Fast inference. Get key at cloud.cerebras.ai",
  },
];

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Interactive setup wizard for API keys")
    .action(async () => {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ask = (q: string, def?: string): Promise<string> =>
        new Promise((r) =>
          rl.question(
            chalk.cyan("  ? ") + q + (def ? chalk.dim(` [${def}] `) : " "),
            (ans) => r(ans.trim() || def || ""),
          ),
        );

      printBanner();
      console.log(`  ${chalk.bold("BeeHive Setup")}\n`);
      console.log(
        `  ${chalk.dim("Configure your LLM provider API keys.")}\n` +
        `  ${chalk.dim("Press Enter to skip a provider.\n")}`,
      );

      const config = loadConfig();

      for (const p of PROVIDERS) {
        console.log(`  ${chalk.bold(p.name)} — ${chalk.dim(p.hint)}`);
        const existing = (config.providers as Record<string, string>)[p.key];
        const masked = existing ? `${existing.slice(0, 8)}...` : undefined;
        const val = await ask(`  ${p.envVar}:`, masked);

        if (val && val !== masked) {
          (config.providers as Record<string, string>)[p.key] = val;
        }
        console.log();
      }

      // Ollama URL
      console.log(`  ${chalk.bold("Ollama")} — ${chalk.dim("Local models. Install at ollama.ai")}`);
      const ollamaUrl = await ask("  OLLAMA_URL:", config.providers.ollama_url ?? "http://localhost:11434");
      if (ollamaUrl) config.providers.ollama_url = ollamaUrl;
      console.log();

      // Default model
      const defaultModel = await ask(
        "  Default model:",
        config.defaults?.model ?? "groq/llama-3.1-8b-instant",
      );
      if (!config.defaults) config.defaults = {};
      config.defaults.model = defaultModel;

      rl.close();

      saveConfig(config);
      applyEnvVars(config);

      console.log(
        `\n  ${chalk.green("✓")} Configuration saved.\n` +
        `  ${chalk.dim("Test it:")} beehive bee test sentiment-scorer --input '{"text":"Great product!"}'\n`,
      );
    });
}
