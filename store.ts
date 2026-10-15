import { promises as fs } from "fs";
import path from "path";

/**
 * Tiny key-value store for ELO snapshots, resolved player IDs and the last payload.
 * - Upstash Redis REST when UPSTASH_REDIS_REST_URL / TOKEN are set (works on Vercel).
 * - JSON files in DATA_DIR (default ./.data) otherwise (works on a VPS / Docker volume).
 * - Falls back to process memory if the disk is read-only (data is then lost on restart).
 */
const mem = new Map<string, unknown>();

const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = () => Boolean(redisUrl() && redisToken());
const dir = () => process.env.DATA_DIR || path.join(process.cwd(), ".data");

export const storageKind = (): "redis" | "file" => (useRedis() ? "redis" : "file");

async function redis(cmd: string[]): Promise<unknown> {
  const res = await fetch(redisUrl() as string, {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(json.error);
  return json.result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    if (useRedis()) {
      const v = await redis(["GET", `ordax:${key}`]);
      return typeof v === "string" ? (JSON.parse(v) as T) : null;
    }
    const raw = await fs.readFile(path.join(dir(), `${key}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return (mem.get(key) as T | undefined) ?? null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  mem.set(key, value);
  try {
    const body = JSON.stringify(value);
    if (useRedis()) {
      await redis(["SET", `ordax:${key}`, body]);
      return;
    }
    await fs.mkdir(dir(), { recursive: true });
    await fs.writeFile(path.join(dir(), `${key}.json`), body, "utf8");
  } catch {
    /* keep the in-memory copy only */
  }
}
