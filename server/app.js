import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { randomBytes, createHash } from "node:crypto";
import {
  today,
  validDate,
  validateReading,
  reportRange,
  slots,
} from "./domain.js";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "8kb" }));
  app.use(cookieParser());
  // Same-origin fetches carry this header; cross-origin requests cannot set it without a preflight.
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("X-Sweety-Request") !== "1"
    )
      return res.status(403).json({ error: "Invalid request origin." });
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in 15 minutes." },
  });
  async function session(res, user) {
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",
      [hash(token), user.id],
    );
    res.cookie("sweety_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 86400000,
      path: "/",
    });
    return { id: user.id, name: user.name, email: user.email };
  }
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
      return res
        .status(400)
        .json({ error: "Name is required (up to 80 characters)." });
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email)
    )
      return res
        .status(400)
        .json({ error: "Please enter a valid email address." });
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password) > 72
    )
      return res.status(400).json({
        error:
          "Password must contain at least 8 characters and at most 72 bytes.",
      });
    try {
      const {
        rows: [user],
      } = await db.query(
        "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email",
        [
          name.trim(),
          email.trim().toLowerCase(),
          await bcrypt.hash(password, 12),
        ],
      );
      res.status(201).json(await session(res, user));
    } catch (e) {
      if (e.code === "23505")
        return res
          .status(409)
          .json({ error: "An account with this email already exists." });
      throw e;
    }
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const { email, password } = req.body || {};
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      Buffer.byteLength(password) > 72
    )
      return res
        .status(400)
        .json({ error: "Please enter your email and password." });
    const {
      rows: [user],
    } = await db.query("SELECT * FROM users WHERE email=$1", [
      email.trim().toLowerCase(),
    ]);
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: "Email or password is incorrect." });
    res.json(await session(res, user));
  });
  app.use("/api", async (req, res, next) => {
    const token = req.cookies.sweety_session;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      return res.status(401).json({ error: "Please log in." });
    const {
      rows: [user],
    } = await db.query(
      "SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>NOW()",
      [hash(token)],
    );
    if (!user)
      return res
        .status(401)
        .json({ error: "Your session has expired. Please log in." });
    req.user = user;
    next();
  });
  app.get("/api/auth/me", (req, res) =>
    res.json({
      ...req.user,
      today: today(),
      timezone: process.env.APP_TIMEZONE || "Asia/Kolkata",
    }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      hash(req.cookies.sweety_session),
    ]);
    res.clearCookie("sweety_session", { path: "/" }).sendStatus(204);
  });
  app.get("/api/readings", async (req, res) => {
    const page = Number(req.query.page || 1),
      limit = Number(req.query.limit || 20);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return res.status(400).json({
        error: "Page must be positive and limit must be between 1 and 100.",
      });
    const { rows } = await db.query(
      "SELECT id,date::text,slot,value FROM readings WHERE user_id=$1 ORDER BY date DESC,slot ASC LIMIT $2 OFFSET $3",
      [req.user.id, limit, (page - 1) * limit],
    );
    const {
      rows: [{ count }],
    } = await db.query(
      "SELECT COUNT(*)::int AS count FROM readings WHERE user_id=$1",
      [req.user.id],
    );
    res.json({ readings: rows, total: count, page, limit });
  });
  async function save(req, res) {
    if (req.params.id && !uuid.test(req.params.id))
      return res.status(404).json({ error: "Reading not found." });
    const error = validateReading(req.body || {});
    if (error) return res.status(400).json({ error });
    const { date, slot, value } = req.body;
    try {
      const sql = req.params.id
        ? "UPDATE readings SET date=$2,slot=$3,value=$4 WHERE user_id=$1 AND id=$5 RETURNING id,date::text,slot,value"
        : "INSERT INTO readings(user_id,date,slot,value) VALUES($1,$2,$3,$4) RETURNING id,date::text,slot,value";
      const args = [req.user.id, date, slot, value];
      if (req.params.id) args.push(req.params.id);
      const {
        rows: [reading],
      } = await db.query(sql, args);
      if (!reading)
        return res.status(404).json({ error: "Reading not found." });
      res.status(req.params.id ? 200 : 201).json(reading);
    } catch (e) {
      if (e.code === "23505")
        return res.status(409).json({
          error: `You already have a ${slots[slot]} reading for this date. You can add only 4 readings per day.`,
        });
      throw e;
    }
  }
  app.post("/api/readings", save);
  app.put("/api/readings/:id", save);
  app.delete("/api/readings/:id", async (req, res) => {
    if (!uuid.test(req.params.id))
      return res.status(404).json({ error: "Reading not found." });
    const result = await db.query(
      "DELETE FROM readings WHERE user_id=$1 AND id=$2",
      [req.user.id, req.params.id],
    );
    if (!result.rowCount)
      return res.status(404).json({ error: "Reading not found." });
    res.sendStatus(204);
  });
  app.get("/api/reports", async (req, res) => {
    const { date, type } = req.query;
    if (
      !validDate(date) ||
      date > today() ||
      !["daily", "mtd", "monthly"].includes(type)
    )
      return res
        .status(400)
        .json({ error: "Choose a valid report date and type." });
    const [start, end] = reportRange(date, type);
    const {
      rows: [stats],
    } = await db.query(
      "SELECT COUNT(*)::int AS count, MIN(value)::int AS lowest,MAX(value)::int AS highest,ROUND(AVG(value),1)::float AS average FROM readings WHERE user_id=$1 AND date BETWEEN $2 AND $3",
      [req.user.id, start, end],
    );
    const { rows } = await db.query(
      "SELECT id,date::text,slot,value FROM readings WHERE user_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date,slot",
      [req.user.id, start, end],
    );
    res.json({ start, end, ...stats, readings: rows });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(err.status === 400 ? 400 : 500).json({
      error:
        err.status === 400
          ? "Invalid JSON request."
          : "Something went wrong. Please try again.",
    });
  });
  return app;
}
