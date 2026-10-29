import type { RunRecord } from "@/lib/types";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Database = { runs: RunRecord[] };

const FILE = path.join(process.cwd(), ".data", "runs.json");

let chain: Promise<unknown> = Promise.resolve();

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

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function createRun(record: RunRecord) {
  return enqueue(async () => {
    const db = await readDb();
    db.runs.unshift(record);
    await writeDb(db);
    return record;
  });
}

export function getRun(id: string) {
  return enqueue(async () => {
    const db = await readDb();
    return db.runs.find((run) => run.id === id) ?? null;
  });
}

export function updateRun(id: string, mutate: (run: RunRecord) => RunRecord) {
  return enqueue(async () => {
    const db = await readDb();
    const index = db.runs.findIndex((run) => run.id === id);
    if (index < 0) return null;
    const next = mutate(db.runs[index]);
    next.updatedAt = new Date().toISOString();
    db.runs[index] = next;
    await writeDb(db);
    return next;
  });
}
