import { readFileSync } from "fs";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const MAX_CHARS = 20000;

export const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",
  description:
    "Read a file from the local filesystem and return its contents as text.",
  parameters: Type.Object({
    path: Type.String({ description: "Absolute or relative file path to read" }),
  }),
  execute: async (_toolCallId, params) => {
    const { path } = params as { path: string };

    let content: string;
    try {
      content = readFileSync(path, "utf-8");
    } catch (e) {
      throw new Error(`Failed to read file "${path}": ${(e as Error).message}`);
    }

    const truncated =
      content.length > MAX_CHARS
        ? `${content.slice(0, MAX_CHARS)}\n\n[File truncated at ${MAX_CHARS} chars]`
        : content;

    return {
      content: [{ type: "text" as const, text: truncated }],
      details: { path, chars: truncated.length },
    };
  },
};
