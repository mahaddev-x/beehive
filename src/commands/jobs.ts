import type { Command } from "commander";
import chalk from "chalk";
import { listJobs, getJob, deleteJob } from "../store.js";
import { printError } from "../ui.js";

export function registerJobsCommand(program: Command): void {
  const jobs = program.command("jobs").description("Manage job history");

  // be jobs list
  jobs
    .command("list")
    .description("List all jobs")
    .action(() => {
      const all = listJobs();
      if (all.length === 0) {
        console.log(chalk.dim("\n  No jobs yet. Run: beehive run <bee> --input <file>\n"));
        return;
      }

      console.log(`\n  ${chalk.bold("Jobs")}\n`);
      console.log(
        chalk.dim(
          `  ${"ID".padEnd(10)} ${"Bee".padEnd(20)} ${"Status".padEnd(10)} ${"Total".padEnd(8)} ${"Date"}`,
        ),
      );
      console.log(chalk.dim("  " + "─".repeat(70)));

      for (const j of all) {
        const status =
          j.status === "done"
            ? chalk.green("done")
            : j.status === "running"
              ? chalk.yellow("running")
              : chalk.red("failed");

        const date = new Date(j.created_at).toLocaleString();
        const succeeded =
          j.succeeded != null
            ? chalk.green(`✓${j.succeeded}`) + " " + chalk.red(`✗${j.failed}`)
            : chalk.dim(String(j.total));

        console.log(
          `  ${chalk.cyan(j.id.padEnd(10))} ${j.bee.padEnd(20)} ${status.padEnd(10)} ` +
          `${succeeded.padEnd(12)} ${chalk.dim(date)}`,
        );
      }
      console.log();
    });

  // be jobs show <id>
  jobs
    .command("show <id>")
    .description("Show job details and summary")
    .action((id: string) => {
      const job = getJob(id);
      if (!job) {
        printError(`Job not found: ${id}`);
        process.exit(1);
      }

      console.log(`\n  ${chalk.bold("Job")} ${chalk.cyan(job.id)}\n`);
      console.log(`  ${chalk.dim("Bee:")}         ${chalk.yellow(job.bee)}`);
      console.log(`  ${chalk.dim("Model:")}       ${chalk.green(job.model)}`);
      console.log(`  ${chalk.dim("Status:")}      ${job.status}`);
      console.log(`  ${chalk.dim("Total:")}       ${job.total}`);
      if (job.succeeded != null) {
        console.log(`  ${chalk.dim("Succeeded:")}   ${chalk.green(String(job.succeeded))}`);
        console.log(`  ${chalk.dim("Failed:")}      ${chalk.red(String(job.failed))}`);
      }
      console.log(`  ${chalk.dim("Created:")}     ${new Date(job.created_at).toLocaleString()}`);
      if (job.completed_at) {
        console.log(`  ${chalk.dim("Completed:")}   ${new Date(job.completed_at).toLocaleString()}`);
      }
      console.log(
        `\n  ${chalk.dim("View results:")} beehive results ${job.id}\n`,
      );
    });

  // be jobs delete <id>
  jobs
    .command("delete <id>")
    .description("Delete a job and its results")
    .action((id: string) => {
      try {
        deleteJob(id);
        console.log(`\n  ${chalk.green("✓")} Deleted job ${chalk.cyan(id)}\n`);
      } catch (e) {
        printError((e as Error).message);
        process.exit(1);
      }
    });
}
