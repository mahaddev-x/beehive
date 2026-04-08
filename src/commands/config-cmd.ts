import type { Command } from "commander";
import chalk from "chalk";
import {
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  getConfigPath,
} from "../config.js";
import { printError } from "../ui.js";

export function registerConfigCommand(program: Command): void {
  const config = program.command("config").description("Manage BeeHive configuration");

  // be config show
  config
    .command("show")
    .description("Print current configuration")
    .action(() => {
      const cfg = loadConfig();
      console.log(`\n  ${chalk.bold("Config")} ${chalk.dim(getConfigPath())}\n`);

      console.log(`  ${chalk.dim("Providers:")}`);
      for (const [k, v] of Object.entries(cfg.providers)) {
        if (!v) continue;
        const masked =
          k === "ollama_url"
            ? String(v)
            : `${String(v).slice(0, 8)}${"*".repeat(12)}`;
        console.log(`    ${chalk.cyan(k.padEnd(28))} ${masked}`);
      }

      console.log(`\n  ${chalk.dim("Defaults:")}`);
      for (const [k, v] of Object.entries(cfg.defaults ?? {})) {
        if (v == null) continue;
        console.log(`    ${chalk.cyan(k.padEnd(28))} ${v}`);
      }
      console.log();
    });

  // be config set <key> <value>
  config
    .command("set <key> <value>")
    .description("Set a config value (e.g. providers.groq_api_key gsk_...)")
    .action((key: string, value: string) => {
      const cfg = loadConfig();
      try {
        setConfigValue(cfg, key, value);
        saveConfig(cfg);
        console.log(
          `\n  ${chalk.green("✓")} Set ${chalk.cyan(key)} = ${
            key.includes("key") ? `${value.slice(0, 8)}...` : value
          }\n`,
        );
      } catch (e) {
        printError((e as Error).message);
        process.exit(1);
      }
    });

  // be config get <key>
  config
    .command("get <key>")
    .description("Get a config value")
    .action((key: string) => {
      const cfg = loadConfig();
      const val = getConfigValue(cfg, key);
      if (val == null) {
        console.log(chalk.dim(`  (not set)`));
      } else {
        console.log(`  ${val}`);
      }
    });
}
