import type { Command } from "commander";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { listBees, loadBee, interpolatePrompt } from "../bee.js";
import { loadConfig, applyEnvVars, getDotDir } from "../config.js";
import { runBee } from "../runner.js";
import {
  printBanner,
  printFullResult,
  printError,
  printInfo,
  renderTestOutput,
} from "../ui.js";

export function registerBeeCommand(program: Command): void {
  const bee = program.command("bee").description("Manage bee definitions");

  // beehive bee list
  bee
    .command("list")
    .description("List all available bees")
    .action(() => {
      const bees = listBees();
      if (bees.length === 0) {
        printInfo("No bees found. Create one with: beehive bee new");
        return;
      }

      console.log(`\n  ${chalk.bold("Available Bees")}\n`);
      const maxName = Math.max(...bees.map((b) => b.name.length));
      for (const b of bees) {
        const location = b._path?.includes(getDotDir()) ? chalk.dim("global") : chalk.dim("local");
        console.log(
          `  ${chalk.cyan(b.name.padEnd(maxName + 2))}` +
          `${chalk.dim((b.description ?? "").padEnd(50))}` +
          `  ${location}`,
        );
      }
      console.log();
    });

  // beehive bee show <name>
  bee
    .command("show <name>")
    .description("Show a bee's full definition")
    .action((name: string) => {
      try {
        const b = loadBee(name);
        console.log(`\n  ${chalk.bold.cyan(b.name)}`);
        if (b.description) console.log(`  ${chalk.dim(b.description)}`);
        console.log();
        console.log(`  ${chalk.dim("Model:")}    ${b.model ?? chalk.dim("(uses default)")}`);
        console.log(`  ${chalk.dim("Parallel:")} ${b.max_parallel ?? 50}`);
        console.log(`  ${chalk.dim("Timeout:")}  ${b.timeout_seconds ?? 60}s`);
        console.log(`  ${chalk.dim("Format:")}   ${b.output_format ?? (b.output_schema ? "json" : "text")}`);
        if (b.tools?.length) {
          console.log(`  ${chalk.dim("Tools:")}    ${b.tools.join(", ")}`);
        }
        console.log();
        console.log(`  ${chalk.dim("System prompt:")}`);
        console.log(
          b.system_prompt
            .split("\n")
            .map((l) => `    ${chalk.white(l)}`)
            .join("\n"),
        );
        console.log();
        console.log(`  ${chalk.dim("Source:")} ${b._path}`);
        console.log();
      } catch (e) {
        printError((e as Error).message);
        process.exit(1);
      }
    });

  // beehive bee test <name>
  bee
    .command("test <name>")
    .description("Run one bee on one input to test it")
    .option("--input <json>", "Input as a JSON object string")
    .option("--model <model>", "Override the bee's model (provider/model-name)")
    .action(async (name: string, opts: { input?: string; model?: string }) => {
      const config = loadConfig();
      applyEnvVars(config);

      let b;
      try {
        b = loadBee(name);
      } catch (e) {
        printError((e as Error).message);
        process.exit(1);
      }

      if (opts.model) b = { ...b, model: opts.model };

      let input: Record<string, string> = {};
      if (opts.input) {
        try {
          input = JSON.parse(opts.input) as Record<string, string>;
        } catch {
          printError("--input must be a valid JSON object");
          process.exit(1);
        }
      }

      printBanner();
      printInfo(
        `Testing ${chalk.cyan(b.name)} with model ${chalk.green(b.model ?? config.defaults?.model ?? "groq/llama-3.1-8b-instant")}`,
      );
      console.log();

      try {
        // Use pi-tui for live streaming output
        const result = await renderTestOutput(async (onChunk, onTool) => {
          return await runBee(b, input, 0, config, { onChunk, onTool });
        });
        printFullResult(result);
      } catch (e) {
        printError((e as Error).message);
        process.exit(1);
      }
    });

  // beehive bee new
  bee
    .command("new")
    .description("Create a new bee interactively")
    .action(async () => {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ask = (q: string): Promise<string> =>
        new Promise((r) => rl.question(chalk.cyan(`  ? `) + q + " ", r));

      printBanner();
      console.log(`  ${chalk.bold("Create a new Bee")}\n`);

      const name = await ask("Bee name (snake_case):");
      const desc = await ask("Description:");
      const model = await ask("Model [groq/llama-3.1-8b-instant]:");
      const system = await ask("System prompt:");
      const template = await ask("User prompt template (use {{variable}}):");
      const formatChoice = await ask("Output format [json/text]:");

      rl.close();

      const outputFormat = formatChoice.toLowerCase() === "text" ? "text" : "json";
      const yaml = [
        `name: ${name || "my-bee"}`,
        `version: "1.0"`,
        `description: "${desc}"`,
        ``,
        `model: ${model || "groq/llama-3.1-8b-instant"}`,
        ``,
        `temperature: 0.1`,
        `max_tokens: 512`,
        `timeout_seconds: 60`,
        `max_parallel: 50`,
        ``,
        `system_prompt: |`,
        `  ${system || "You are a helpful assistant."}`,
        ``,
        `user_prompt_template: |`,
        `  ${template || "{{text}}"}`,
        ``,
        `output_format: ${outputFormat}`,
        ...(outputFormat === "json"
          ? [``, `output_schema:`, `  result: string`]
          : []),
        ``,
        `tools: []`,
        ``,
        `retry:`,
        `  max_attempts: 3`,
        `  backoff_seconds: 2`,
      ].join("\n");

      const beesDir = join(process.cwd(), "bees");
      const { mkdirSync } = await import("fs");
      mkdirSync(beesDir, { recursive: true });

      const outPath = join(beesDir, `${name || "my-bee"}.yaml`);
      writeFileSync(outPath, yaml, "utf-8");

      console.log(
        `\n  ${chalk.green("✓")} Created ${chalk.cyan(outPath)}\n` +
        `  Test it: ${chalk.dim(`beehive bee test ${name || "my-bee"} --input '{"text":"hello"}'"`)}\n`,
      );
    });

  // beehive bee create <file>
  bee
    .command("create <file>")
    .description("Load and validate a bee YAML file")
    .action((file: string) => {
      if (!existsSync(file)) {
        printError(`File not found: ${file}`);
        process.exit(1);
      }
      try {
        const b = loadBee(file);
        console.log(`\n  ${chalk.green("✓")} Valid bee: ${chalk.cyan(b.name)}\n`);
      } catch (e) {
        printError(`Invalid bee YAML: ${(e as Error).message}`);
        process.exit(1);
      }
    });
}
