import { readFile } from "node:fs/promises";
import { pool } from "./db.js";
export async function migrate(db = pool) {
  await db.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await migrate();
  await pool.end();
  console.log("Database ready.");
}
