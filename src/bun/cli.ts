#!/usr/bin/env node
/**
 * Bun entry point for beehive — used by `bun build --compile` to produce
 * self-contained native binaries. Identical to src/index.ts but compiled
 * by Bun instead of tsc, so the runtime is embedded in the binary.
 */
import { Command } from "commander";
import { registerRunCommand } from "../commands/run.js";
import { registerBeeCommand } from "../commands/bee-cmd.js";
import { registerResultsCommand } from "../commands/results.js";
import { registerJobsCommand } from "../commands/jobs.js";
import { registerSetupCommand } from "../commands/setup.js";
import { registerConfigCommand } from "../commands/config-cmd.js";

process.title = "beehive";

const program = new Command();

program
  .name("beehive")
  .description("Local-first parallel AI agent swarm runner")
  .version("0.5.0");

registerRunCommand(program);
registerBeeCommand(program);
registerResultsCommand(program);
registerJobsCommand(program);
registerSetupCommand(program);
registerConfigCommand(program);

program.parse(process.argv);
