/**
 * Terminal UI using @mariozechner/pi-tui for all rendering.
 * Falls back to basic stderr output for non-interactive environments.
 */
import chalk from "chalk";
import type { BeeResult } from "./store.js";
import type { SwarmProgress } from "./dispatcher.js";

// We use pi-tui for rich rendering where possible.
// For batch progress (non-interactive), we use inline line rewriting.
// For `be bee test` (interactive), we use pi-tui's full component stack.

export { renderTestOutput } from "./ui-tui.js";

export function printBanner(): void {
  console.log(
    "\n" +
    chalk.bold.cyan("  ╔══════════════════════╗\n") +
    chalk.bold.cyan("  ║") + chalk.bold.white(" BeeHive ") + chalk.dim("v2  ·  swarm") + chalk.bold.cyan("  ║\n") +
    chalk.bold.cyan("  ╚══════════════════════╝"),
  );
  console.log();
}

export function printJobHeader(
  jobId: string,
  bee: string,
  model: string,
  total: number,
  parallel: number,
): void {
  console.log(
    `  ${chalk.bold("Job")}   ${chalk.cyan(jobId)}` +
    `  ${chalk.dim("·")}  ${chalk.yellow(bee)}` +
    `  ${chalk.dim("·")}  ${chalk.green(model)}`,
  );
  console.log(
    `  ${chalk.dim(`${total} tasks  ·  ${parallel} parallel`)}\n`,
  );
}

let _lastLen = 0;

export function printProgress(p: SwarmProgress): void {
  const pct = p.total > 0 ? Math.floor((p.completed / p.total) * 100) : 0;
  const w = 28;
  const f = Math.floor((pct / 100) * w);
  const bar = chalk.cyan("█".repeat(f)) + chalk.dim("░".repeat(w - f));

  const line =
    `  [${bar}] ${chalk.bold(String(p.completed).padStart(4))}/${p.total}` +
    `  ${chalk.green("✓")} ${p.succeeded}` +
    `  ${chalk.red("✗")} ${p.failed}` +
    (p.running > 0 ? `  ${chalk.yellow(`~${p.running}`)}` : "");

  process.stderr.write(
    "\r" + line + " ".repeat(Math.max(0, _lastLen - line.length)),
  );
  _lastLen = line.length;
}

export function clearProgress(): void {
  if (_lastLen > 0) {
    process.stderr.write("\r" + " ".repeat(_lastLen) + "\r");
    _lastLen = 0;
  }
}

export function printSummary(results: BeeResult[], durationMs: number): void {
  clearProgress();
  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const tokensIn = results.reduce((s, r) => s + r.tokens_input, 0);
  const tokensOut = results.reduce((s, r) => s + r.tokens_output, 0);
  const cost = results.reduce((s, r) => s + r.cost_usd, 0);
  const avgMs =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.duration_ms, 0) / results.length)
      : 0;

  console.log(`\n  ${chalk.bold("Done")}  ${chalk.dim(fmtDuration(durationMs))}\n`);
  console.log(
    `  ${chalk.green("✓")} ${chalk.bold(String(succeeded))} succeeded  ` +
    `${chalk.red("✗")} ${chalk.bold(String(failed))} failed`,
  );
  console.log(
    `  ${chalk.dim("Tokens")} ${tokensIn.toLocaleString()} in · ${tokensOut.toLocaleString()} out` +
    `  ${chalk.dim("Cost")} $${cost.toFixed(6)}  ${chalk.dim("Avg")} ${avgMs}ms`,
  );
  console.log();
}

export function printResultsTable(results: BeeResult[]): void {
  for (const r of results) {
    const icon = r.status === "success" ? chalk.green("✓") : chalk.red("✗");
    const inputPreview = Object.values(r.input).join(", ").slice(0, 48);
    const outputPreview = r.output
      ? (typeof r.output === "string" ? r.output : JSON.stringify(r.output)).slice(0, 72)
      : (r.error?.slice(0, 72) ?? "");

    console.log(
      `  ${icon} ${chalk.dim(`#${String(r.index + 1).padStart(3)}`)}` +
      `  ${chalk.dim(inputPreview.padEnd(50))}` +
      `  ${chalk.white(outputPreview)}`,
    );
  }
}

export function printFullResult(r: BeeResult): void {
  const icon = r.status === "success" ? chalk.green("✓") : chalk.red("✗");
  console.log(`\n${icon} ${chalk.bold(r.status.toUpperCase())}`);

  if (r.output != null) {
    console.log(chalk.dim("\nOutput:"));
    if (typeof r.output === "object") {
      console.log(chalk.white(JSON.stringify(r.output, null, 2)));
    } else {
      console.log(chalk.white(r.output));
    }
  }

  if (r.error) {
    console.log(chalk.red(`\nError: ${r.error}`));
  }

  console.log(
    chalk.dim(
      `\nModel: ${r.model_used}  ` +
      `Tokens: ${r.tokens_input}↑ ${r.tokens_output}↓  ` +
      `Cost: $${r.cost_usd.toFixed(6)}  ` +
      `Duration: ${r.duration_ms}ms` +
      (r.turns != null ? `  Turns: ${r.turns}` : ""),
    ),
  );
}

export function printError(msg: string): void {
  console.error(`\n  ${chalk.red("✗")} ${chalk.bold("Error:")} ${msg}\n`);
}

export function printInfo(msg: string): void {
  console.log(`  ${chalk.dim("·")} ${msg}`);
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
