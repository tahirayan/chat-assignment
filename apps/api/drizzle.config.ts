import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// Anchor relative paths to apps/api/ (not process.cwd()) so drizzle-kit
// produces the same file path as the runtime client regardless of where the
// command is invoked from.
const API_ROOT = resolve(fileURLToPath(import.meta.url), "..");

function anchor(databaseUrl: string): string {
  const raw = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
  if (raw === ":memory:" || isAbsolute(raw)) {
    return raw;
  }
  return resolve(API_ROOT, raw);
}

const url = `file:${anchor(process.env.DATABASE_URL ?? "file:./chat.db")}`;

export default defineConfig({
  dialect: "sqlite",
  // Relative paths here intentionally — drizzle-kit 0.31 mishandles
  // Windows absolute paths in the `out` field on `generate`. The
  // package.json scripts `cd apps/api` first so these resolve against
  // the right anchor. (`db:credentials.url` IS anchored above so the
  // runtime client always finds chat.db, regardless of cwd.)
  schema: "src/db/schema.ts",
  out: "src/db/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
