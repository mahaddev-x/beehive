#!/usr/bin/env node
/**
 * BeeHive CLI entry point.
 *
 * Uses tsx/esm/api to register TypeScript support directly in the Node.js
 * module loader — no subprocess, no build step, no latency.
 * Any change to src/ is picked up on the next invocation instantly.
 */
import { register } from "tsx/esm/api";

const unregister = register();

try {
  await import("../src/index.ts");
} finally {
  unregister();
}
