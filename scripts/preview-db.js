// Disposable local QA database. Not used by the deployed app or Docker setup.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { access } from "node:fs/promises";
import { seed } from "../server/seed.js";
const cluster = new EmbeddedPostgres({
  databaseDir: "/tmp/sweety-preview-pg",
  port: 15438,
  user: "postgres",
  password: "preview_local",
  persistent: true,
  postgresFlags: ["-k", ""],
  onLog: () => {},
  onError: console.error,
});
try { await access("/tmp/sweety-preview-pg/PG_VERSION"); } catch { await cluster.initialise(); }
await cluster.start();
const db = new pg.Pool({
  connectionString:
    "postgres://postgres:preview_local@localhost:15438/postgres",
});
await seed(db);
await db.end();
console.log("Preview database ready");
process.on("SIGTERM", async () => {
  await cluster.stop();
  process.exit();
});
process.on("SIGINT", async () => {
  await cluster.stop();
  process.exit();
});
setInterval(() => {}, 60000);
