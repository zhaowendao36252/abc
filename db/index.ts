import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type WorkerEnv = typeof import("cloudflare:workers").env;

async function getWorkerEnv():Promise<WorkerEnv> {
  // The Electron build runs the bundled site with Node. Do not resolve the
  // Cloudflare-only module there; the client automatically uses its local
  // ledger fallback when the hosted D1 API is unavailable.
  if (typeof process !== "undefined" && process.env?.ELECTRON_RUN_AS_NODE === "1") {
    throw new Error("Desktop mode uses the local ledger");
  }
  const { env } = await import("cloudflare:workers");
  return env;
}

export async function getDb() {
  const env = await getWorkerEnv();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

let schemaReady: Promise<unknown> | null = null;

async function prepareSchema(env:WorkerEnv) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'expense',
      merchant TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL DEFAULT '',
      person_id INTEGER,
      reimbursed_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS transaction_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      version_kind TEXT NOT NULL DEFAULT 'saved',
      kind TEXT NOT NULL,
      merchant TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL DEFAULT '',
      person_id INTEGER,
      reimbursed_at TEXT,
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(transaction_date DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS persons_name_idx ON persons(name)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS transaction_versions_transaction_idx ON transaction_versions(transaction_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS transaction_versions_recorded_idx ON transaction_versions(recorded_at DESC)"),
  ]);
  const columns = await env.DB.prepare("PRAGMA table_info(transactions)").all<{ name:string }>();
  if (!columns.results.some((column) => column.name === "person_id")) {
    await env.DB.prepare("ALTER TABLE transactions ADD COLUMN person_id INTEGER").run();
  }
  if (!columns.results.some((column) => column.name === "deleted_at")) {
    await env.DB.prepare("ALTER TABLE transactions ADD COLUMN deleted_at TEXT").run();
  }
  if (!columns.results.some((column) => column.name === "reimbursed_at")) {
    await env.DB.prepare("ALTER TABLE transactions ADD COLUMN reimbursed_at TEXT").run();
  }
  const versionColumns = await env.DB.prepare("PRAGMA table_info(transaction_versions)").all<{ name:string }>();
  if (!versionColumns.results.some((column) => column.name === "reimbursed_at")) {
    await env.DB.prepare("ALTER TABLE transaction_versions ADD COLUMN reimbursed_at TEXT").run();
  }
  await env.DB.prepare(`INSERT INTO transaction_versions (
    transaction_id, version_kind, kind, merchant, amount_cents, category, transaction_date, note, source_text, person_id, reimbursed_at
  ) SELECT t.id, 'imported', t.kind, t.merchant, t.amount_cents, t.category, t.transaction_date, t.note, t.source_text, t.person_id, t.reimbursed_at
    FROM transactions t
    WHERE NOT EXISTS (SELECT 1 FROM transaction_versions v WHERE v.transaction_id = t.id)`).run();
}

export async function ensureDb() {
  const env = await getWorkerEnv();
  if (!env.DB) throw new Error("账本数据库尚未连接");
  schemaReady ??= prepareSchema(env);
  await schemaReady;
  return drizzle(env.DB, { schema });
}
