/**
 * Rich interactive output using @mariozechner/pi-tui.
 * Used for `be bee test` — live streaming with markdown rendering.
 * Falls back to plain text when stdout is not a TTY.
 */
import chalk from "chalk";
import type { BeeResult } from "./store.js";

/**
 * Render a single bee test result.
 * Uses pi-tui's TUI when stdout is interactive, plain streaming otherwise.
 */
export async function renderTestOutput(
  run: (
    onChunk: (text: string) => void,
    onTool: (name: string, args: Record<string, unknown>) => void,
  ) => Promise<BeeResult>,
): Promise<BeeResult> {
  if (!process.stdout.isTTY) {
    return runPlain(run);
  }

  try {
    const { TUI, ProcessTerminal, Text, Loader } = await import("@mariozechner/pi-tui");
    return runWithTUI(run, { TUI, ProcessTerminal, Text, Loader });
  } catch {
    // pi-tui not available or failed to init — fall back
    return runPlain(run);
  }
}

async function runWithTUI(
  run: (
    onChunk: (text: string) => void,
    onTool: (name: string, args: Record<string, unknown>) => void,
  ) => Promise<BeeResult>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: any,
): Promise<BeeResult> {
  const { TUI, ProcessTerminal, Text, Loader } = components;

  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  let output = "";
  const textNode = new Text("", 1, 0);
  const loader = new Loader(
    tui,
    (s: string) => chalk.cyan(s),
    (s: string) => chalk.dim(s),
    "thinking…",
  );

  tui.addChild(loader);
  tui.addChild(textNode);
  tui.start();

  const onChunk = (delta: string): void => {
    output += delta;
    textNode.setText(output);
    loader.stop();
    tui.requestRender();
  };

  const onTool = (name: string, args: Record<string, unknown>): void => {
    const argStr = Object.values(args).join(", ").slice(0, 60);
    loader.setMessage(`⚙ ${name}(${argStr})…`);
    loader.start();
    tui.requestRender();
  };

  try {
    const result = await run(onChunk, onTool);
    loader.stop();
    tui.requestRender();
    await new Promise((r) => setTimeout(r, 50));
    tui.stop();
    return result;
  } catch (e) {
    loader.stop();
    tui.stop();
    throw e;
  }
}

async function runPlain(
  run: (
    onChunk: (text: string) => void,
    onTool: (name: string, args: Record<string, unknown>) => void,
  ) => Promise<BeeResult>,
): Promise<BeeResult> {
  const onChunk = (delta: string): void => {
    process.stdout.write(delta);
  };

  const onTool = (name: string, args: Record<string, unknown>): void => {
    const argStr = Object.entries(args)
      .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
      .join(", ");
    process.stderr.write(chalk.dim(`\n  [tool: ${name}(${argStr})]\n`));
  };

  const result = await run(onChunk, onTool);
  process.stdout.write("\n");
  return result;
}
