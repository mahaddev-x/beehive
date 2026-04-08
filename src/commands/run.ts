import type { Command } from "commander";
import chalk from "chalk";
import { loadBee } from "../bee.js";
import { loadConfig, applyEnvVars } from "../config.js";
import {
  parseInputFile,
  parseInlineJson,
  parseStdin,
} from "../input.js";
import { createJob, finalizeJob } from "../store.js";
import { runSwarm } from "../dispatcher.js";
import {
  printBanner,
  printJobHeader,
  printProgress,
  printSummary,
  printResultsTable,
  printError,
} from "../ui.js";
import type { BeeResult } from "../store.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run <bee>")
    .description("Run a bee against a dataset in parallel")
    .option("--input <file>", "Input file (CSV, JSON array, or JSONL)")
    .option("--input-json <json>", "Inline JSON array input")
    .option("--from-stdin", "Read JSON array or JSONL from stdin")
    .option("--parallel <n>", "Max concurrent bees", "50")
    .option("--model <model>", "Override the bee's model (provider/model-name)")
    .option("--output <file>", "Write results to file")
    .option("--format <fmt>", "Output format: table|json|csv|jsonl", "table")
    .option("--quiet", "Suppress progress output")
    .action(async (beeName: string, opts: Record<string, string>) => {
      const config = loadConfig();
      applyEnvVars(config);

      // Load bee
      let bee;
      try {
        bee = loadBee(beeName);
      } catch (e) {
        printError((e as Error).message);
        process.exit(1);
      }

      // Override model if provided
      if (opts.model) {
        bee = { ...bee, model: opts.model };
      }

      // Parse inputs
      let inputs: Record<string, string>[];
      try {
        if (opts.fromStdin) {
          inputs = await parseStdin();
        } else if (opts.inputJson) {
          inputs = parseInlineJson(opts.inputJson);
        } else if (opts.input) {
          inputs = parseInputFile(opts.input);
        } else {
          printError("Provide --input <file>, --input-json <json>, or --from-stdin");
          process.exit(1);
        }
      } catch (e) {
        printError(`Input error: ${(e as Error).message}`);
        process.exit(1);
      }

      if (inputs.length === 0) {
        printError("Input is empty.");
        process.exit(1);
      }

      const parallel = parseInt(opts.parallel ?? "50", 10);
      const modelStr =
        bee.model ?? config.defaults?.model ?? "groq/llama-3.1-8b-instant";

      // Create job
      const jobId = createJob(bee.name, modelStr, inputs.length, parallel);

      if (!opts.quiet) {
        printBanner();
        printJobHeader(jobId, bee.name, modelStr, inputs.length, parallel);
      }

      const startTime = Date.now();
      const allResults: BeeResult[] = [];

      await runSwarm(
        bee,
        inputs,
        {
          parallel,
          jobId,
          onProgress: opts.quiet ? undefined : printProgress,
          onResult: (result) => {
            allResults.push(result);
          },
        },
        config,
      );

      const duration = Date.now() - startTime;
      const succeeded = allResults.filter((r) => r.status === "success").length;
      const failed = allResults.filter((r) => r.status === "failed").length;

      finalizeJob(jobId, succeeded, failed);

      if (!opts.quiet) {
        printSummary(allResults, duration);
      }

      // Output results
      const fmt = opts.format ?? "table";
      const sorted = allResults.sort((a, b) => a.index - b.index);

      if (opts.output) {
        const { writeFileSync } = await import("fs");
        writeFileSync(opts.output, formatResults(sorted, fmt), "utf-8");
        console.log(`  ${chalk.dim("Results saved to:")} ${opts.output}`);
      } else if (fmt !== "table" || !opts.quiet) {
        if (fmt === "table") {
          printResultsTable(sorted);
        } else {
          process.stdout.write(formatResults(sorted, fmt));
        }
      }

      console.log(`\n  ${chalk.dim("Job ID:")} ${chalk.cyan(jobId)}`);
      console.log(`  ${chalk.dim("View results:")} beehive results ${jobId}\n`);

      process.exit(failed > 0 && succeeded === 0 ? 1 : 0);
    });
}

function formatResults(results: BeeResult[], fmt: string): string {
  switch (fmt) {
    case "json":
      return JSON.stringify(results, null, 2) + "\n";
    case "jsonl":
      return results.map((r) => JSON.stringify(r)).join("\n") + "\n";
    case "csv": {
      const rows = results.map((r) => ({
        index: r.index,
        status: r.status,
        ...Object.fromEntries(
          Object.entries(r.input).map(([k, v]) => [`input_${k}`, v]),
        ),
        output: typeof r.output === "object"
          ? JSON.stringify(r.output)
          : (r.output ?? ""),
        error: r.error ?? "",
        duration_ms: r.duration_ms,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        cost_usd: r.cost_usd.toFixed(8),
        model_used: r.model_used,
      }));
      const headers = Object.keys(rows[0] ?? {});
      const csvLine = (obj: Record<string, unknown>) =>
        headers.map((h) => {
          const v = String(obj[h] ?? "");
          return v.includes(",") || v.includes('"') || v.includes("\n")
            ? `"${v.replace(/"/g, '""')}"`
            : v;
        }).join(",");
      return [headers.join(","), ...rows.map(csvLine)].join("\n") + "\n";
    }
    default:
      return "";
  }
}
