import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimitKey } from "../server/rate-limit-key.js";

const request = (ip, forwarded) => ({
  ip,
  get: (name) => (name === "x-real-ip" ? forwarded : undefined),
});

test("rate limiting distinguishes Vercel clients behind a shared proxy", () => {
  const previous = process.env.VERCEL;
  try {
    process.env.VERCEL = "1";
    assert.notEqual(
      rateLimitKey(request("10.0.0.1", "192.0.2.1")),
      rateLimitKey(request("10.0.0.1", "192.0.2.2")),
    );
    assert.equal(
      rateLimitKey(request("10.0.0.1", "2001:db8:abcd:1200::1")),
      rateLimitKey(request("10.0.0.1", "2001:db8:abcd:1200::2")),
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("self-hosted deployments ignore a forged Vercel client-IP header", () => {
  const previous = process.env.VERCEL;
  try {
    delete process.env.VERCEL;
    assert.equal(
      rateLimitKey(request("192.0.2.1", "198.51.100.1")),
      rateLimitKey(request("192.0.2.1", "198.51.100.2")),
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
