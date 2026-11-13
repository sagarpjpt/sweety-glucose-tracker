import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../api/index.js";

test("Vercel entry exports the existing API without opening a listener", async () => {
  const response = await request(app).get("/api/auth/me");
  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Please log in.");
});

test("Vercel entry preserves mutation origin protection", async () => {
  const response = await request(app).post("/api/auth/login").send({});
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "Invalid request origin.");
});
