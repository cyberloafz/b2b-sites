import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * One tiny interface over two drivers:
 *   DATABASE_URL set  → real PostgreSQL (Supabase, Neon, RDS …) via `pg`
 *   not set           → embedded PostgreSQL (PGlite) stored in .data/pglite, for local work
 * Application code only ever calls q(), one() and tx().
 */
export type Queryable = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };

type Db = Queryable & { transaction<R>(fn: (t: Queryable) => Promise<R>): Promise<R> };

const g = globalThis as unknown as { __db?: Promise<Db> };

async function connect(): Promise<Db> {
  const schema = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  // Vercel's Neon/Postgres integrations provide DATABASE_URL or POSTGRES_URL.
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url && process.env.VERCEL) throw new Error("No database: add a Postgres database (e.g. Neon) in Vercel → Storage, which sets DATABASE_URL.");
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: process.env.VERCEL ? 3 : 10 });
    // Apply the schema once per version, under a lock, so parallel cold starts do not race.
    const version = createHash("sha256").update(schema).digest("hex").slice(0, 16);
    const c = await pool.connect();
    try {
      await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const done = await c.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
      if (!done.rows.length) {
        await c.query("SELECT pg_advisory_lock(746101)");
        try {
          await c.query(schema);
          await c.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [version]);
        } finally {
          await c.query("SELECT pg_advisory_unlock(746101)");
        }
      }
    } finally {
      c.release();
    }
    return {
      query: (sql, params) => pool.query(sql, params as unknown[]) as never,
      async transaction(fn) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const r = await fn({ query: (s, p) => c.query(s, p as unknown[]) as never });
          await c.query("COMMIT");
          return r;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(path.dirname(dir), { recursive: true });
  const lite = new PGlite(dir);
  await lite.exec(schema);
  return {
    query: (sql, params) => lite.query(sql, params) as never,
    transaction: (fn) => lite.transaction((t) => fn({ query: (s, p) => t.query(s, p) as never })),
  };
}

export function db(): Promise<Db> {
  g.__db ??= connect();
  return g.__db;
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await (await db()).query<T>(sql, params)).rows;
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export async function tx<R>(fn: (t: Queryable) => Promise<R>): Promise<R> {
  return (await db()).transaction(fn);
}

/** JSONB parameters: pass objects through JSON.stringify so both drivers store them identically. */
export const json = (v: unknown) => JSON.stringify(v);
