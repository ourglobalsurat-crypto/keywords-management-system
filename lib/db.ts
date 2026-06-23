import postgres from "postgres";

// ───────────────────────────────────────────────────────────────
// Database client (Neon Postgres via postgres.js)
//
// We keep a single connection (max: 1) which is the correct pattern
// for serverless functions on Vercel. The pooled Neon connection
// string handles concurrency on the server side.
//
// The client is created LAZILY (on first query) via a Proxy so that
// importing this module never throws — important because Next.js loads
// route modules at build time when DATABASE_URL may not be present.
// ───────────────────────────────────────────────────────────────

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __sql: Sql | undefined;
  // eslint-disable-next-line no-var
  var __schemaReady: Promise<void> | undefined;
}

function createClient(): Sql {
  // Accept whichever variable name the host/integration provides. The Vercel
  // Neon integration may set DATABASE_URL or POSTGRES_URL, etc. — so a plain
  // "Add Neon" in the Vercel dashboard wires the app up with no manual step.
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a Neon database and add the pooled " +
        "connection string to your environment variables (.env.local locally, " +
        "and Vercel → Settings → Environment Variables in production)."
    );
  }
  return postgres(url, {
    ssl: "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
    prepare: false, // required for Neon's pooled (PgBouncer) endpoint
  });
}

function getClient(): Sql {
  if (!global.__sql) global.__sql = createClient();
  return global.__sql;
}

// A lazy proxy that behaves exactly like the postgres.js `sql` tag/function
// but defers actual connection creation until the first call/property access.
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    // Handles both tagged-template usage sql`...` and helper usage sql(rows).
    return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as Sql;
