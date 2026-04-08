import type { AgentTool } from "@mariozechner/pi-agent-core";
import { fetchUrlTool } from "./fetch-url.js";
import { readFileTool } from "./read-file.js";

const BUILT_IN: Record<string, AgentTool> = {
  fetch_url: fetchUrlTool,
  read_file: readFileTool,
};

export function resolveTools(toolNames: string[]): AgentTool[] {
  return toolNames.map((name) => {
    const tool = BUILT_IN[name];
    if (!tool) {
      throw new Error(
        `Unknown built-in tool "${name}". Available: ${Object.keys(BUILT_IN).join(", ")}`,
      );
    }
    return tool;
  });
}

export async function loadPlugins(pluginPaths: string[]): Promise<AgentTool[]> {
  const tools: AgentTool[] = [];
  for (const pluginPath of pluginPaths) {
    try {
      const mod = (await import(pluginPath)) as {
        default?: AgentTool | AgentTool[];
        tools?: AgentTool[];
      };
      const exported = mod.tools ?? mod.default;
      if (Array.isArray(exported)) {
        tools.push(...exported);
      } else if (exported) {
        tools.push(exported);
      }
    } catch (e) {
      throw new Error(
        `Failed to load plugin "${pluginPath}": ${(e as Error).message}`,
      );
    }
  }
  return tools;
}
