import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
});

// Release idle connections before a Vercel instance is suspended.
if (process.env.VERCEL) attachDatabasePool(pool);
