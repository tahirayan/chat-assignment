import { fileURLToPath } from "node:url";
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";
import type { DrizzleDb } from "./client";

export function runMigrations(db: DrizzleDb): void {
  const migrationsFolder = fileURLToPath(
    new URL("./migrations", import.meta.url)
  );
  drizzleMigrate(db, { migrationsFolder });
}
