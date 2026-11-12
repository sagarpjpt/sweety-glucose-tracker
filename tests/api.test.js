import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { migrate } from "../server/migrate.js";
import { reportRange, today, validateReading } from "../server/domain.js";
let cluster, db, app, owner, other, dir;
const send = (agent, method, url, body) =>
  agent[method](url).set("X-Sweety-Request", "1").send(body);
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "sweety-test-"));
  cluster = new EmbeddedPostgres({
    databaseDir: dir,
    port: 15439,
    user: "postgres",
    password: "test_local",
    persistent: false,
    postgresFlags: ["-k", ""],
    onLog: () => {},
    onError: console.error,
  });
  await cluster.initialise();
  await cluster.start();
  db = new pg.Pool({
    connectionString: "postgres://postgres:test_local@localhost:15439/postgres",
  });
  await migrate(db);
  app = createApp(db);
  owner = request.agent(app);
  other = request.agent(app);
  for (const [agent, email] of [
    [owner, "owner@example.com"],
    [other, "other@example.com"],
  ])
    assert.equal(
      (
        await send(agent, "post", "/api/auth/register", {
          name: "Test Reader",
          email,
          password: "test-password-123",
        })
      ).status,
      201,
    );
});
after(async () => {
  await db?.end();
  await cluster?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("auth: hashed passwords, own profile, duplicate email and invalid login", async () => {
  const {
    rows: [u],
  } = await db.query("SELECT * FROM users WHERE email=$1", [
    "owner@example.com",
  ]);
  assert.ok(u.password_hash.startsWith("$2"));
  assert.notEqual(u.password_hash, "test-password-123");
  assert.equal((await request(app).get("/api/readings")).status, 401);
  assert.equal(
    (
      await send(request(app), "post", "/api/auth/login", {
        email: u.email,
        password: "wrong",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await send(request(app), "post", "/api/auth/register", {
        name: "x",
        email: u.email,
        password: "test-password-123",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await send(request(app), "post", "/api/auth/register", {
        name: "x",
        email: "bad",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal((await owner.get("/api/auth/me")).body.email, u.email);
});
test("validation rejects missing, decimal, out-of-range values, invalid dates and slots", async () => {
  for (const value of ["", null, 39, 601, 100.5, "120"])
    assert.equal(
      (
        await send(owner, "post", "/api/readings", {
          date: "2026-10-15",
          slot: 0,
          value,
        })
      ).status,
      400,
    );
  for (const date of ["2026-02-30", "9999-01-01", "not-a-date"])
    assert.equal(
      (
        await send(owner, "post", "/api/readings", {
          date,
          slot: 0,
          value: 120,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await send(owner, "post", "/api/readings", {
        date: "2026-10-15",
        slot: 4,
        value: 120,
      })
    ).status,
    400,
  );
  assert.ok(
    validateReading({ date: today(), slot: 0, value: 40 }) === undefined,
  );
});
test("CRUD is private; updates preserve uniqueness; no fifth reading is possible", async () => {
  const date = "2026-08-15";
  const ids = [];
  for (let slot = 0; slot < 4; slot++) {
    const r = await send(owner, "post", "/api/readings", {
      date,
      slot,
      value: 100 + slot,
    });
    assert.equal(r.status, 201);
    ids.push(r.body.id);
  }
  assert.equal(
    (await send(owner, "post", "/api/readings", { date, slot: 0, value: 150 }))
      .status,
    409,
  );
  assert.equal((await other.get("/api/readings")).body.total, 0);
  assert.equal(
    (
      await send(other, "put", "/api/readings/" + ids[0], {
        date,
        slot: 0,
        value: 150,
      })
    ).status,
    404,
  );
  assert.equal(
    (await send(other, "delete", "/api/readings/" + ids[0])).status,
    404,
  );
  assert.equal(
    (
      await send(owner, "put", "/api/readings/" + ids[0], {
        date,
        slot: 1,
        value: 150,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await send(owner, "put", "/api/readings/" + ids[0], {
        date,
        slot: 0,
        value: 600,
      })
    ).body.value,
    600,
  );
  assert.equal(
    (await send(owner, "delete", "/api/readings/" + ids[0])).status,
    204,
  );
  assert.equal(
    (await send(owner, "delete", "/api/readings/" + ids[0])).status,
    404,
  );
});
test("concurrent requests cannot duplicate a daily slot", async () => {
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      send(owner, "post", "/api/readings", {
        date: "2026-07-01",
        slot: 0,
        value: 120,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 5);
});
test("reports use calendar boundaries, rounded averages, empty state and user isolation", async () => {
  for (const [date, value] of [
    ["2026-09-01", 70],
    ["2026-09-30", 110],
    ["2026-10-01", 100],
    ["2026-10-15", 121],
    ["2026-10-16", 500],
  ])
    await send(owner, "post", "/api/readings", { date, slot: 0, value });
  await send(other, "post", "/api/readings", {
    date: "2026-10-15",
    slot: 0,
    value: 600,
  });
  let r = (await owner.get("/api/reports?date=2026-10-15&type=mtd")).body;
  assert.equal(r.count, 2);
  assert.equal(r.average, 110.5);
  assert.equal(r.highest, 121);
  assert.equal(r.lowest, 100);
  r = (await owner.get("/api/reports?date=2026-10-15&type=monthly")).body;
  assert.equal(r.count, 2);
  assert.equal(r.average, 90);
  assert.equal(r.end, "2026-09-30");
  r = (await owner.get("/api/reports?date=2026-10-15&type=daily")).body;
  assert.equal(r.count, 1);
  assert.equal(r.readings[0].slot, 0);
  r = (await owner.get("/api/reports?date=2020-01-01&type=daily")).body;
  assert.equal(r.count, 0);
  assert.equal(r.average, null);
  assert.deepEqual(reportRange("2026-01-15", "monthly"), [
    "2025-12-01",
    "2025-12-31",
  ]);
  assert.deepEqual(reportRange("2024-03-15", "monthly"), [
    "2024-02-01",
    "2024-02-29",
  ]);
});
test("pagination validates bounds and returns stable ordering", async () => {
  const r = await owner.get("/api/readings?page=1&limit=2");
  assert.equal(r.body.readings.length, 2);
  assert.equal(r.body.readings[0].date, "2026-10-16");
  assert.equal((await owner.get("/api/readings?page=0")).status, 400);
  assert.equal((await owner.get("/api/readings?limit=101")).status, 400);
});
test("cross-origin mutation guard and logout invalidate session", async () => {
  assert.equal((await owner.post("/api/readings").send({})).status, 403);
  assert.equal((await send(other, "post", "/api/auth/logout")).status, 204);
  assert.equal((await other.get("/api/auth/me")).status, 401);
});
