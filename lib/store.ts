import type { RunRecord } from "@/lib/types";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Database = { runs: RunRecord[] };

const FILE = path.join(process.cwd(), ".data", "runs.json");
const TIMEOUT_MS = 8_000;

const ENV_NAMES = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "OUTREACH_ALLOW_TO",
  "DEMO_EMAIL",
  "DEMO_PHONE",
  "ANTHROPIC_API_KEY",
  "APIFY_API_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export type EnvName = (typeof ENV_NAMES)[number];
export type SupabaseState = "unconfigured" | "ok" | "missing_table" | "unauthorized" | "unreachable";

let chain: Promise<unknown> = Promise.resolve();
let remoteReady = false;
let remoteBlocked = false;

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function envPresence(): Record<EnvName, boolean> {
  const presence = {} as Record<EnvName, boolean>;
  for (const name of ENV_NAMES) presence[name] = envValue(name).length > 0;
  return presence;
}

function supabaseEnv() {
  const url = (envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/$/, "");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return { url, key };
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readDb(): Promise<Database> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Database;
    if (!Array.isArray(parsed.runs)) return { runs: [] };
    return parsed;
  } catch {
    return { runs: [] };
  }
}

async function writeDb(db: Database) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(db, null, 2));
}

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RunRecord>;
  return typeof record.id === "string" && typeof record.createdAt === "string" && typeof record.updatedAt === "string";
}

async function readLocal(id: string) {
  const db = await readDb();
  return db.runs.find((run) => run.id === id) ?? null;
}

async function writeLocal(record: RunRecord) {
  const db = await readDb();
  const index = db.runs.findIndex((run) => run.id === record.id);
  if (index >= 0) db.runs[index] = record;
  else db.runs.unshift(record);
  await writeDb(db);
}

async function drain(res: Response) {
  try {
    await res.arrayBuffer();
  } catch {
    // The status is enough. Response bodies can echo request details, so they are discarded.
  }
}

async function rest(pathAndQuery: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase is not configured.");
  return fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    method: init?.method ?? "GET",
    body: init?.body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      ...init?.headers,
    },
  });
}

async function errorCode(res: Response) {
  try {
    const body = (await res.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : "";
  } catch {
    return "";
  }
}

export async function supabaseStatus(): Promise<SupabaseState> {
  if (!supabaseEnv()) return "unconfigured";
  try {
    const res = await rest("runs?select=id&limit=1");
    if (res.ok) {
      await drain(res);
      return "ok";
    }
    if (res.status === 401 || res.status === 403) {
      await drain(res);
      return "unauthorized";
    }
    const code = await errorCode(res);
    if (res.status === 404 || code === "PGRST205") return "missing_table";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}

async function ensureRemote() {
  if (remoteReady) return true;
  if (remoteBlocked) return false;
  const state = await supabaseStatus();
  if (state === "ok") {
    remoteReady = true;
    return true;
  }
  if (state === "missing_table" || state === "unauthorized" || state === "unconfigured") remoteBlocked = true;
  return false;
}

async function readRemote(id: string): Promise<RunRecord | null | undefined> {
  if (!(await ensureRemote())) return undefined;
  try {
    const res = await rest(`runs?id=eq.${encodeURIComponent(id)}&select=payload`);
    if (!res.ok) {
      await drain(res);
      return undefined;
    }
    const rows = (await res.json()) as { payload?: unknown }[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const payload = rows[0]?.payload;
    const record = typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
    return isRunRecord(record) ? record : null;
  } catch {
    return undefined;
  }
}

async function writeRemote(record: RunRecord) {
  if (!(await ensureRemote())) return false;
  try {
    const res = await rest("runs?on_conflict=id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: record.id,
        payload: record,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      }),
    });
    await drain(res);
    return res.ok;
  } catch {
    return false;
  }
}

function newer(left: RunRecord, right: RunRecord) {
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  if (Number.isNaN(leftTime)) return right;
  if (Number.isNaN(rightTime)) return left;
  return leftTime >= rightTime ? left : right;
}

async function loadRun(id: string) {
  const local = await readLocal(id);
  const remote = await readRemote(id);
  if (remote === undefined) return local;
  if (!remote) {
    if (local) await writeRemote(local);
    return local;
  }
  if (!local) {
    await writeLocal(remote);
    return remote;
  }
  const pick = newer(remote, local);
  if (pick.updatedAt !== local.updatedAt) await writeLocal(pick);
  if (pick.updatedAt !== remote.updatedAt) await writeRemote(pick);
  return pick;
}

export function createRun(record: RunRecord) {
  return enqueue(async () => {
    await writeLocal(record);
    await writeRemote(record);
    return record;
  });
}

export function getRun(id: string) {
  return enqueue(() => loadRun(id));
}

export function updateRun(id: string, mutate: (run: RunRecord) => RunRecord) {
  return enqueue(async () => {
    const current = await loadRun(id);
    if (!current) return null;
    const next = mutate(current);
    next.updatedAt = new Date().toISOString();
    await writeLocal(next);
    await writeRemote(next);
    return next;
  });
}
