import { readFileSync } from "fs";
import { parse as parseCsv } from "csv-parse/sync";
import { extname } from "path";

export type InputRow = Record<string, string>;

export function parseInputFile(filePath: string): InputRow[] {
  const content = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  if (ext === ".csv") {
    return parseCsvContent(content);
  } else if (ext === ".jsonl") {
    return parseJsonlContent(content);
  } else if (ext === ".json") {
    return parseJsonContent(content);
  }

  // Auto-detect: try CSV first, then JSONL, then JSON
  const trimmed = content.trimStart();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return trimmed.startsWith("[")
      ? parseJsonContent(content)
      : parseJsonlContent(content);
  }
  return parseCsvContent(content);
}

export function parseInlineJson(json: string): InputRow[] {
  return parseJsonContent(json);
}

export async function parseStdin(): Promise<InputRow[]> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      try {
        const trimmed = data.trimStart();
        if (trimmed.startsWith("[")) {
          resolve(parseJsonContent(data));
        } else {
          resolve(parseJsonlContent(data));
        }
      } catch (e) {
        reject(e);
      }
    });
    process.stdin.on("error", reject);
  });
}

function parseCsvContent(content: string): InputRow[] {
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  return records.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, String(v)]),
    ),
  );
}

function parseJsonContent(content: string): InputRow[] {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON input must be an array of objects");
  }
  return parsed.map((item, i) => {
    if (typeof item !== "object" || item == null) {
      throw new Error(`JSON item at index ${i} must be an object`);
    }
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>).map(([k, v]) => [
        k,
        String(v),
      ]),
    );
  });
}

function parseJsonlContent(content: string): InputRow[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        return Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [k, String(v)]),
        );
      } catch {
        throw new Error(`Invalid JSON on line ${i + 1}: ${line}`);
      }
    });
}
