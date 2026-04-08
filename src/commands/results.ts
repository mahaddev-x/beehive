import type { Command } from "commander";
import chalk from "chalk";
import { loadResults, getJob } from "../store.js";
import { printResultsTable, printError } from "../ui.js";

export function registerResultsCommand(program: Command): void {
  program
    .command("results <job-id>")
    .description("Show the results of a completed job")
    .option("--format <fmt>", "Output format: table|json|csv|jsonl", "table")
    .option("--output <file>", "Write to file")
    .option("--failed-only", "Show only failed results")
    .action(async (jobId: string, opts: Record<string, string | boolean>) => {
      const job = getJob(jobId);
      if (!job) {
        printError(`Job not found: ${jobId}`);
        process.exit(1);
      }

      let results = loadResults(jobId);

      if (opts.failedOnly) {
        results = results.filter((r) => r.status === "failed");
      }

      if (results.length === 0) {
        console.log(chalk.dim("  No results found."));
        return;
      }

      console.log(`\n  ${chalk.bold("Job")} ${chalk.cyan(job.id)}`);
      console.log(
        `  ${chalk.dim("Bee:")} ${chalk.yellow(job.bee)}` +
        `  ${chalk.dim("Model:")} ${chalk.green(job.model)}` +
        `  ${chalk.dim("Status:")} ${job.status === "done" ? chalk.green("done") : chalk.red(job.status)}`,
      );
      if (job.succeeded != null) {
        console.log(
          `  ${chalk.green("✓")} ${job.succeeded} succeeded  ` +
          `${chalk.red("✗")} ${job.failed} failed`,
        );
      }
      console.log();

      const fmt = String(opts.format ?? "table");

      if (opts.output) {
        const { writeFileSync } = await import("fs");
        let out: string;
        switch (fmt) {
          case "json":
            out = JSON.stringify(results, null, 2) + "\n";
            break;
          case "jsonl":
            out = results.map((r) => JSON.stringify(r)).join("\n") + "\n";
            break;
          default:
            out = results.map((r) => JSON.stringify(r)).join("\n") + "\n";
        }
        writeFileSync(String(opts.output), out, "utf-8");
        console.log(`  ${chalk.dim("Saved to:")} ${opts.output}\n`);
        return;
      }

      switch (fmt) {
        case "json":
          process.stdout.write(JSON.stringify(results, null, 2) + "\n");
          break;
        case "jsonl":
          process.stdout.write(results.map((r) => JSON.stringify(r)).join("\n") + "\n");
          break;
        default:
          printResultsTable(results);
          break;
      }

      console.log();
    });
}
