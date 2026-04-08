import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { getDotDir } from "./config.js";
import { randomUUID } from "crypto";

export interface BeeResult {
  index: number;
  status: "success" | "failed";
  input: Record<string, string>;
  output?: string | Record<string, unknown>;
  error?: string;
  duration_ms: number;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  model_used: string;
  completed_at: string;
  turns?: number;
}

export interface JobMeta {
  id: string;
  bee: string;
  model: string;
  total: number;
  parallel: number;
  status: "running" | "done" | "failed";
  created_at: string;
  completed_at?: string;
  succeeded?: number;
  failed?: number;
}

function getJobsDir(): string {
  return join(getDotDir(), "jobs");
}

function getJobDir(jobId: string): string {
  return join(getJobsDir(), jobId);
}

function getJobMetaPath(jobId: string): string {
  return join(getJobDir(jobId), "meta.json");
}

function getResultsPath(jobId: string): string {
  return join(getJobDir(jobId), "results.jsonl");
}

export function createJob(
  bee: string,
  model: string,
  total: number,
  parallel: number,
): string {
  const id = randomUUID().slice(0, 8);
  const dir = getJobDir(id);
  mkdirSync(dir, { recursive: true });

  const meta: JobMeta = {
    id,
    bee,
    model,
    total,
    parallel,
    status: "running",
    created_at: new Date().toISOString(),
  };
  writeFileSync(getJobMetaPath(id), JSON.stringify(meta, null, 2), "utf-8");
  return id;
}

export function saveResult(jobId: string, result: BeeResult): void {
  const line = JSON.stringify(result) + "\n";
  const path = getResultsPath(jobId);
  writeFileSync(path, line, { flag: "a", encoding: "utf-8" });
}

export function finalizeJob(
  jobId: string,
  succeeded: number,
  failed: number,
): void {
  const meta = getJob(jobId);
  if (!meta) return;
  meta.status = failed === meta.total ? "failed" : "done";
  meta.completed_at = new Date().toISOString();
  meta.succeeded = succeeded;
  meta.failed = failed;
  writeFileSync(getJobMetaPath(jobId), JSON.stringify(meta, null, 2), "utf-8");
}

export function loadResults(jobId: string): BeeResult[] {
  const path = getResultsPath(jobId);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as BeeResult)
    .sort((a, b) => a.index - b.index);
}

export function getJob(jobId: string): JobMeta | null {
  const path = getJobMetaPath(jobId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as JobMeta;
}

export function listJobs(): JobMeta[] {
  const dir = getJobsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((id) => getJob(id))
    .filter((j): j is JobMeta => j !== null)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

export function deleteJob(jobId: string): void {
  const dir = getJobDir(jobId);
  if (!existsSync(dir)) throw new Error(`Job not found: ${jobId}`);
  rmSync(dir, { recursive: true, force: true });
}
