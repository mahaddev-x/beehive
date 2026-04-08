import pLimit from "p-limit";
import type { BeeDefinition } from "./bee.js";
import type { BeConfig } from "./config.js";
import type { BeeResult } from "./store.js";
import { runBee } from "./runner.js";
import { saveResult } from "./store.js";

export interface SwarmProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  running: number;
}

export interface DispatchOptions {
  parallel?: number;
  jobId: string;
  onProgress?: (progress: SwarmProgress) => void;
  onResult?: (result: BeeResult, progress: SwarmProgress) => void;
}

export async function runSwarm(
  bee: BeeDefinition,
  inputs: Record<string, string>[],
  options: DispatchOptions,
  config: BeConfig,
): Promise<BeeResult[]> {
  const concurrency = Math.min(
    options.parallel ?? bee.max_parallel ?? 50,
    1000,
  );
  const limit = pLimit(concurrency);

  const progress: SwarmProgress = {
    total: inputs.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    running: 0,
  };

  const results: BeeResult[] = [];

  const tasks = inputs.map((input, index) =>
    limit(async () => {
      progress.running++;
      options.onProgress?.(progress);

      const result = await runBee(bee, input, index, config);

      progress.running--;
      progress.completed++;
      if (result.status === "success") {
        progress.succeeded++;
      } else {
        progress.failed++;
      }

      saveResult(options.jobId, result);
      results.push(result);
      options.onResult?.(result, { ...progress });
      options.onProgress?.({ ...progress });

      return result;
    }),
  );

  await Promise.all(tasks);

  return results.sort((a, b) => a.index - b.index);
}
