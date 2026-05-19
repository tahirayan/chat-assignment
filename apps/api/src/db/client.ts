import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
// biome-ignore lint/performance/noNamespaceImport: Drizzle expects the full schema object for relational queries
import * as schema from "./schema";

export type DrizzleDb = ReturnType<typeof createDb>;

/**
 * Resolves the SQLite file path so it lives at a stable location regardless
 * of where the api was invoked from:
 *
 *   • `file:/data/chat.db`  (or any absolute path)  → used as-is (Railway prod)
 *   • `file:./chat.db`  or  `chat.db`               → apps/api/chat.db (dev default)
 *   • `:memory:`                                    → in-memory (tests)
 *
 * Without this, `file:./chat.db` would land at process.cwd() — which varies
 * between `nx serve api`, `tsx apps/api/src/main.ts` from root, and
 * `drizzle-kit` runs from `apps/api/`. Anchoring to API_ROOT keeps the file
 * in one place.
 */
export function resolveSqlitePath(databaseUrl: string): string {
  const raw = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
  if (raw === ":memory:" || isAbsolute(raw)) {
    return raw;
  }
  // apps/api/src/db/client.ts → apps/api/
  const API_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
  return resolve(API_ROOT, raw);
}

export function createDb(databaseUrl: string) {
  const path = resolveSqlitePath(databaseUrl);
  const sqlite = new Database(path);
  // WAL improves concurrent-read throughput; safe with single writer.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  return Object.assign(db, { $client: sqlite });
}
