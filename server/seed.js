import bcrypt from "bcrypt";
import { pool } from "./db.js";
import { migrate } from "./migrate.js";
import { today } from "./domain.js";
export async function seed(db = pool) {
  await migrate(db);
  const {
    rows: [user],
  } = await db.query(
    "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING id",
    [
      "Demo Reader",
      "demo@sweety.example",
      await bcrypt.hash(process.env.DEMO_PASSWORD || "DemoPass123!", 12),
    ],
  );
  const now = new Date(today() + "T12:00:00Z");
  for (let day = 40; day >= 0; day--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - day);
    for (let slot = 0; slot < 4; slot++) {
      if (day === 0 && slot > 1) continue;
      await db.query(
        "INSERT INTO readings(user_id,date,slot,value) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,date,slot) DO NOTHING",
        [
          user.id,
          d.toISOString().slice(0, 10),
          slot,
          88 + ((day * 7 + slot * 23) % 89),
        ],
      );
    }
  }
  console.log(
    "Demo user ready: demo@sweety.example (password configured by DEMO_PASSWORD).",
  );
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await seed();
  await pool.end();
}
